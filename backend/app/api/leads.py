from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_, asc, desc, nullslast
from typing import Optional
import json

from app.database import get_db
from app.models import (
    Lead, LeadStatus, PipelineStage,
    User, UserRole, ManagerClientAssignment, AuditLog,
)
from app.schemas import (
    LeadCreate, LeadResponse, PaginatedLeads, CampaignStats,
    LeadSortField, SortDirection, LeadStageUpdate,
    PipelineBoard, PipelineColumn, TerminalCount,
)
from app.core.dependencies import get_current_user, check_permission

router = APIRouter(prefix="/api/leads", tags=["leads"])


# ── Stage constants ───────────────────────────────────────────────────────────
# These must be built from models.PipelineStage, not schemas.PipelineStage.
# The two enums have identical members but are different Python classes, so
# a membership test across them is always False and the guard silently fails.

# Board columns, in display order
ACTIVE_STAGES = (
    PipelineStage.not_contacted,
    PipelineStage.contacted,
    PipelineStage.responded,
    PipelineStage.advisor_assigned,
    PipelineStage.documents_sent,
    PipelineStage.invested,
)

# Dead ends — shown as counts beneath the board rather than as columns
TERMINAL_STAGES = (
    PipelineStage.retrying,
    PipelineStage.unreachable,
    PipelineStage.declined,
    PipelineStage.do_not_call,
)

# Set by the system when a call completes, never by a person. Allowing manual
# entry would let the pipeline contradict the call record.
SYSTEM_OWNED_STAGES = (
    PipelineStage.not_contacted,
)

# Stages that only make sense once someone has actually spoken to the lead.
# Checked against attempts rather than status: status says how the last call
# went, attempts says whether any call happened at all.
REQUIRES_CONTACT = (
    PipelineStage.responded,
    PipelineStage.advisor_assigned,
    PipelineStage.documents_sent,
    PipelineStage.invested,
)

# How many leads each board column returns. The board is a summary — a column
# holding 400 leads shows the first 50 and its true count in the header.
BOARD_COLUMN_LIMIT = 50

# Roles allowed to move a lead through the pipeline. Analysts are read-only
# here; a dedicated can_move_stage permission could be added later if a
# Client Owner needs to grant it selectively.
STAGE_MOVERS = (
    UserRole.super_admin,
    UserRole.reachflow_manager,
    UserRole.client_owner,
    UserRole.client_manager,
)


# ── Shared scoping ────────────────────────────────────────────────────────────

def scoped_lead_query(current_user: User, db: Session, client_id: Optional[int] = None):
    """
    A Lead query already filtered to what this user may see.

    Super Admin       — everything, optionally narrowed to one client
    ReachFlow Manager — only clients assigned to them
    Client roles      — only their own client, always

    Every leads endpoint starts here, so the boundary cannot be enforced in
    one place and forgotten in another.
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

    return query.filter(Lead.client_id == current_user.client_id)


def write_audit(
    db: Session,
    user: User,
    action: str,
    resource: str,
    details: dict,
    request: Optional[Request] = None,
) -> None:
    """Record a state-changing action. Committed by the caller."""
    db.add(AuditLog(
        user_id=user.id,
        action=action,
        resource=resource,
        details=json.dumps(details),
        ip_address=request.client.host if request and request.client else None,
    ))


# ── GET leads — paginated, searchable, sortable ───────────────────────────────

@router.get("/", response_model=PaginatedLeads)
def get_leads(
    skip:      int = Query(0, ge=0),
    limit:     int = Query(20, ge=1, le=200),
    status:    Optional[str] = None,
    stage:     Optional[str] = Query(None, description="Filter by pipeline stage"),
    client_id: Optional[int] = None,
    search:    Optional[str] = Query(None, description="Matches name or phone"),
    sort_by:   LeadSortField = LeadSortField.created_at,
    sort_dir:  SortDirection = SortDirection.desc,
    current_user: User = Depends(get_current_user),
    db:        Session = Depends(get_db),
):
    """List leads with server-side search, sorting and pagination."""
    query = scoped_lead_query(current_user, db, client_id)

    if status:
        try:
            query = query.filter(Lead.status == LeadStatus[status])
        except KeyError:
            valid = ", ".join(s.name for s in LeadStatus)
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status '{status}'. Expected one of: {valid}",
            )

    if stage:
        try:
            query = query.filter(Lead.pipeline_stage == PipelineStage[stage])
        except KeyError:
            valid = ", ".join(s.name for s in PipelineStage)
            raise HTTPException(
                status_code=400,
                detail=f"Invalid stage '{stage}'. Expected one of: {valid}",
            )

    # ilike is case-insensitive; leading % makes it "contains" rather than
    # "starts with", which is what a search box implies.
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(or_(Lead.name.ilike(term), Lead.phone.ilike(term)))

    total = query.count()

    # nullslast keeps never-called leads at the bottom when sorting by
    # last_called, rather than jumping to the top.
    column = getattr(Lead, sort_by.value)
    order = asc(column) if sort_dir == SortDirection.asc else desc(column)

    # Secondary sort on id keeps paging stable when the primary key ties —
    # without it two leads with equal scores can swap between pages.
    query = query.order_by(nullslast(order), Lead.id.asc())

    items = query.offset(skip).limit(limit).all()
    return PaginatedLeads(items=items, total=total, skip=skip, limit=limit)


# ── GET pipeline board ────────────────────────────────────────────────────────
# Declared before /{lead_id} so FastAPI doesn't read "pipeline" as an id.

@router.get("/pipeline/board", response_model=PipelineBoard)
def get_pipeline_board(
    client_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    The Progress board in one request.

    Returns the six active stages with their leads, plus counts for the four
    terminal stages. Fetching each column separately would mean ten requests
    for a single screen.
    """
    base = scoped_lead_query(current_user, db, client_id)

    columns = []
    for stage in ACTIVE_STAGES:
        stage_query = base.filter(Lead.pipeline_stage == stage)
        count = stage_query.count()
        leads = (
            stage_query
            .order_by(desc(Lead.score), Lead.id.asc())
            .limit(BOARD_COLUMN_LIMIT)
            .all()
        )
        columns.append(PipelineColumn(stage=stage, count=count, leads=leads))

    terminal = [
        TerminalCount(
            stage=stage,
            count=base.filter(Lead.pipeline_stage == stage).count(),
        )
        for stage in TERMINAL_STAGES
    ]

    return PipelineBoard(
        columns=columns,
        terminal=terminal,
        total=base.count(),
    )


# ── GET campaign stats ────────────────────────────────────────────────────────

@router.get("/stats/campaign", response_model=CampaignStats)
def get_campaign_stats(
    client_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Counts by status, scoped to what this user can see."""
    base = scoped_lead_query(current_user, db, client_id)

    def count_of(s: LeadStatus) -> int:
        return base.filter(Lead.status == s).count()

    agreed    = count_of(LeadStatus.agreed)
    declined  = count_of(LeadStatus.declined)
    no_answer = count_of(LeadStatus.no_answer)

    return CampaignStats(
        total=base.count(),
        called=agreed + declined + no_answer,
        agreed=agreed,
        declined=declined,
        no_answer=no_answer,
        pending=count_of(LeadStatus.pending),
        calling=count_of(LeadStatus.calling),
    )


# ── PATCH lead stage ──────────────────────────────────────────────────────────

@router.patch("/{lead_id}/stage", response_model=LeadResponse)
def update_lead_stage(
    lead_id: int,
    body: LeadStageUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Move a lead to a different pipeline stage.

    Backwards moves are allowed — real sales work is not linear and a deal
    legitimately stalls. What is blocked is any move that would make the
    pipeline contradict the call record.
    """
    if current_user.role not in STAGE_MOVERS:
        raise HTTPException(
            status_code=403,
            detail="Your role cannot move leads through the pipeline",
        )

    # Scoped lookup — a user cannot reach another client's lead by id
    lead = scoped_lead_query(current_user, db).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail=f"Lead {lead_id} not found")

    # Convert the incoming schema enum to the models enum by value
    new_stage = PipelineStage(body.stage.value)

    if new_stage in SYSTEM_OWNED_STAGES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"'{new_stage.value}' is set automatically by the system "
                "and cannot be applied manually"
            ),
        )

    if new_stage in REQUIRES_CONTACT and lead.attempts == 0:
        raise HTTPException(
            status_code=400,
            detail=(
                f"This lead has never been called, so it cannot move to "
                f"'{new_stage.value}'. Stages beyond 'contacted' require a "
                "completed call."
            ),
        )

    # A lead on the do-not-call register must not re-enter the pipeline
    if lead.is_ndnc and new_stage != PipelineStage.do_not_call:
        raise HTTPException(
            status_code=400,
            detail="This lead is on the do-not-call register and cannot be moved",
        )

    previous = lead.pipeline_stage
    if previous == new_stage:
        return lead   # nothing changed, nothing worth auditing

    lead.pipeline_stage = new_stage

    write_audit(
        db, current_user,
        action="lead.stage_changed",
        resource=f"lead:{lead.id}",
        details={
            "from": previous.value,
            "to": new_stage.value,
            "note": body.note,
        },
        request=request,
    )

    db.commit()
    db.refresh(lead)
    return lead


# ── GET single lead ───────────────────────────────────────────────────────────

@router.get("/{lead_id}", response_model=LeadResponse)
def get_lead(
    lead_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch one lead, scoped through the same helper as the list."""
    lead = scoped_lead_query(current_user, db).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail=f"Lead {lead_id} not found")
    return lead


# ── POST create lead ──────────────────────────────────────────────────────────

@router.post("/", response_model=LeadResponse, status_code=201)
def create_lead(
    lead_in: LeadCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a lead. Requires can_upload_leads for client roles."""
    if not check_permission(current_user, "can_upload_leads", db):
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to upload leads",
        )

    # Client roles can only create under their own client, whatever they send
    if current_user.role not in (UserRole.super_admin, UserRole.reachflow_manager):
        lead_in.client_id = current_user.client_id

    lead = Lead(
        name=lead_in.name,
        phone=lead_in.phone,
        language=lead_in.language,
        client_id=lead_in.client_id,
        uploaded_by=current_user.id,
        pipeline_stage=PipelineStage.not_contacted,
    )
    db.add(lead)
    db.flush()

    write_audit(
        db, current_user,
        action="lead.created",
        resource=f"lead:{lead.id}",
        details={"name": lead.name, "client_id": lead.client_id},
        request=request,
    )

    db.commit()
    db.refresh(lead)
    return lead