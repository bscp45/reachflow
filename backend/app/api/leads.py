from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, asc, desc, nullslast
from typing import List, Optional

from app.database import get_db
from app.models import Lead, LeadStatus, User, UserRole, ManagerClientAssignment
from app.schemas import (
    LeadCreate,
    LeadResponse,
    PaginatedLeads,
    CampaignStats,
    LeadSortField,
    SortDirection,
)
from app.core.dependencies import get_current_user, check_permission

router = APIRouter(prefix="/api/leads", tags=["leads"])


# ── Shared scoping helper ─────────────────────────────────────────────────────

def scoped_lead_query(current_user: User, db: Session, client_id: Optional[int] = None):
    """
    Build a Lead query already filtered to what this user is allowed to see.

    Super Admin       — everything, optionally narrowed to one client
    ReachFlow Manager — only clients assigned to them
    Client roles      — only their own client, always

    Every leads endpoint starts from here so the boundary can't be forgotten
    in one place and enforced in another.
    """
    query = db.query(Lead)

    if current_user.role == UserRole.super_admin:
        if client_id:
            query = query.filter(Lead.client_id == client_id)
        return query

    if current_user.role == UserRole.reachflow_manager:
        assigned = db.query(ManagerClientAssignment.client_id).filter(
            ManagerClientAssignment.manager_id == current_user.id
        ).all()
        assigned_ids = [a.client_id for a in assigned]

        # No assignments means no leads — not all leads
        if not assigned_ids:
            return query.filter(Lead.client_id == -1)

        if client_id and client_id in assigned_ids:
            return query.filter(Lead.client_id == client_id)
        return query.filter(Lead.client_id.in_(assigned_ids))

    # All client roles — own client only, no exceptions
    return query.filter(Lead.client_id == current_user.client_id)


# ── GET leads — paginated, searchable, sortable ───────────────────────────────

@router.get("/", response_model=PaginatedLeads)
def get_leads(
    skip:      int = Query(0, ge=0),
    limit:     int = Query(20, ge=1, le=200),
    status:    Optional[str] = None,
    client_id: Optional[int] = None,
    search:    Optional[str] = Query(None, description="Matches name or phone"),
    sort_by:   LeadSortField = LeadSortField.created_at,
    sort_dir:  SortDirection = SortDirection.desc,
    current_user: User = Depends(get_current_user),
    db:        Session = Depends(get_db),
):
    """
    List leads with server-side search, sorting and pagination.

    Returns the page of rows plus the total matching count, so the client
    can render pagination without having fetched everything.
    """
    query = scoped_lead_query(current_user, db, client_id)

    # Status filter
    if status:
        try:
            query = query.filter(Lead.status == LeadStatus[status])
        except KeyError:
            valid = ", ".join(s.name for s in LeadStatus)
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status '{status}'. Expected one of: {valid}",
            )

    # Search across name and phone.
    # ilike is case-insensitive; the leading % means "contains" rather than
    # "starts with", which is what a user expects from a search box.
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(or_(Lead.name.ilike(term), Lead.phone.ilike(term)))

    # Count before pagination — this is the total across all pages
    total = query.count()

    # Sort. nullslast keeps leads that have never been called at the bottom
    # rather than jumping to the top when sorting by last_called.
    column = getattr(Lead, sort_by.value)
    order = asc(column) if sort_dir == SortDirection.asc else desc(column)
    query = query.order_by(nullslast(order))

    # Secondary sort on id keeps the order stable when the primary key ties —
    # without it, two leads with the same score can swap places between pages.
    query = query.order_by(nullslast(order), Lead.id.asc())

    items = query.offset(skip).limit(limit).all()

    return PaginatedLeads(items=items, total=total, skip=skip, limit=limit)


# ── GET campaign stats ────────────────────────────────────────────────────────
# Declared before /{lead_id} — otherwise FastAPI matches "stats" as a lead id.

@router.get("/stats/campaign", response_model=CampaignStats)
def get_campaign_stats(
    client_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregate counts by status, scoped to what this user can see."""
    base = scoped_lead_query(current_user, db, client_id)

    def count_of(s: LeadStatus) -> int:
        return base.filter(Lead.status == s).count()

    total     = base.count()
    agreed    = count_of(LeadStatus.agreed)
    declined  = count_of(LeadStatus.declined)
    no_answer = count_of(LeadStatus.no_answer)
    pending   = count_of(LeadStatus.pending)
    calling   = count_of(LeadStatus.calling)

    return CampaignStats(
        total=total,
        called=agreed + declined + no_answer,
        agreed=agreed,
        declined=declined,
        no_answer=no_answer,
        pending=pending,
        calling=calling,
    )


# ── GET single lead ───────────────────────────────────────────────────────────

@router.get("/{lead_id}", response_model=LeadResponse)
def get_lead(
    lead_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Fetch one lead.

    Scoped through the same helper as the list endpoint, so a user cannot
    reach another client's lead by guessing its id.
    """
    lead = scoped_lead_query(current_user, db).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail=f"Lead {lead_id} not found")

    # Enforce client boundary
    if current_user.role.value not in ["super_admin", "reachflow_manager"]:
        if lead.client_id != current_user.client_id:
            raise HTTPException(
                status_code=403,
                detail="Access denied — this lead belongs to another client"
            )

    return lead


# ── POST create lead ──────────────────────────────────────────────────────────

@router.post("/", response_model=LeadResponse, status_code=201)
def create_lead(
    lead_in: LeadCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a lead. Requires can_upload_leads for client roles."""
    if not check_permission(current_user, "can_upload_leads", db):
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to upload leads",
        )

    # Client roles can only ever create leads under their own client,
    # regardless of what client_id they send.
    if current_user.role not in (UserRole.super_admin, UserRole.reachflow_manager):
        lead_in.client_id = current_user.client_id

    lead = Lead(
        name=lead_in.name,
        phone=lead_in.phone,
        language=lead_in.language,
        client_id=lead_in.client_id,
        uploaded_by=current_user.id,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead
