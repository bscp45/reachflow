from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import Lead, LeadStatus, User
from app.schemas import LeadCreate, LeadResponse, CampaignStats
from app.core.dependencies import (
    get_current_user,
    get_client_scope,
    check_permission,
)

router = APIRouter(prefix="/api/leads", tags=["leads"])

# ── GET all leads ─────────────────────────────────────────────────────────────

@router.get("/", response_model=List[LeadResponse])
def get_leads(
    skip:      int = 0,
    limit:     int = 100,
    status:    Optional[str] = None,
    client_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db:        Session = Depends(get_db),
):
    """
    Get all leads. Results filtered based on user role:
    - Super Admin: all leads across all clients
    - ReachFlow Manager: leads from assigned clients only
    - Client roles: own client leads only
    """
    query = db.query(Lead)

    # Apply role-based client filter
    if current_user.role.value == "super_admin":
        # Super Admin sees everything
        if client_id:
            query = query.filter(Lead.client_id == client_id)
    elif current_user.role.value == "reachflow_manager":
        # Manager sees assigned clients only
        from app.models import ManagerClientAssignment
        assigned = db.query(ManagerClientAssignment.client_id).filter(
            ManagerClientAssignment.manager_id == current_user.id
        ).all()
        assigned_ids = [a.client_id for a in assigned]
        query = query.filter(Lead.client_id.in_(assigned_ids))
        if client_id and client_id in assigned_ids:
            query = query.filter(Lead.client_id == client_id)
    else:
        # All client roles — own client only, hard boundary
        query = query.filter(Lead.client_id == current_user.client_id)

    # Filter by status if provided
    if status:
        try:
            lead_status = LeadStatus[status]
            query = query.filter(Lead.status == lead_status)
        except KeyError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status: {status}"
            )

    return query.offset(skip).limit(limit).all()

# ── GET single lead ───────────────────────────────────────────────────────────

@router.get("/stats/campaign", response_model=CampaignStats)
def get_campaign_stats(
    client_id:    Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    """Get campaign statistics filtered by role."""
    query = db.query(Lead)

    if current_user.role.value == "super_admin":
        if client_id:
            query = query.filter(Lead.client_id == client_id)
    elif current_user.role.value == "reachflow_manager":
        from app.models import ManagerClientAssignment
        assigned = db.query(ManagerClientAssignment.client_id).filter(
            ManagerClientAssignment.manager_id == current_user.id
        ).all()
        assigned_ids = [a.client_id for a in assigned]
        query = query.filter(Lead.client_id.in_(assigned_ids))
    else:
        query = query.filter(Lead.client_id == current_user.client_id)

    total     = query.count()
    agreed    = query.filter(Lead.status == LeadStatus.agreed).count()
    declined  = query.filter(Lead.status == LeadStatus.declined).count()
    no_answer = query.filter(Lead.status == LeadStatus.no_answer).count()
    pending   = query.filter(Lead.status == LeadStatus.pending).count()
    calling   = query.filter(Lead.status == LeadStatus.calling).count()
    called    = agreed + declined + no_answer

    return CampaignStats(
        total=total,
        called=called,
        agreed=agreed,
        declined=declined,
        no_answer=no_answer,
        pending=pending,
        calling=calling,
    )

@router.get("/{lead_id}", response_model=LeadResponse)
def get_lead(
    lead_id:      int,
    current_user: User = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    """Get single lead — enforces client boundary."""
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
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
    lead_in:      LeadCreate,
    current_user: User = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    """
    Create a lead manually.
    Requires can_upload_leads permission for client roles.
    """
    # Check upload permission
    if not check_permission(current_user, "can_upload_leads", db):
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to upload leads"
        )

    # Enforce client boundary
    if current_user.role.value not in ["super_admin", "reachflow_manager"]:
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