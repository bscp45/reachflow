from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import CallLog, Lead, User, UserRole, ManagerClientAssignment
from app.schemas import CallLogResponse
from app.core.dependencies import get_current_user, check_permission

router = APIRouter(prefix="/api/calls", tags=["calls"])


def user_can_see_lead(current_user: User, lead: Lead, db: Session) -> bool:
    """
    Whether this user is allowed to see anything about this lead.

    Mirrors the scoping in leads.py. Kept as an explicit check here because
    call transcripts are the most sensitive data in the system — a leak
    across the client boundary would expose an actual recorded conversation.
    """
    if current_user.role == UserRole.super_admin:
        return True

    if current_user.role == UserRole.reachflow_manager:
        assignment = db.query(ManagerClientAssignment).filter(
            ManagerClientAssignment.manager_id == current_user.id,
            ManagerClientAssignment.client_id == lead.client_id,
        ).first()
        return assignment is not None

    return current_user.client_id == lead.client_id


@router.get("/lead/{lead_id}", response_model=List[CallLogResponse])
def get_calls_for_lead(
    lead_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Full call history for one lead, newest first.

    A lead called three times returns three records, so the drawer can show
    how the conversation developed across attempts rather than only the last.
    """
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail=f"Lead {lead_id} not found")

    if not user_can_see_lead(current_user, lead, db):
        # 404 rather than 403 on purpose — a 403 would confirm the lead exists,
        # which itself leaks information across the client boundary.
        raise HTTPException(status_code=404, detail=f"Lead {lead_id} not found")

    if not check_permission(current_user, "can_view_transcripts", db):
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to view call transcripts",
        )

    return (
        db.query(CallLog)
        .filter(CallLog.lead_id == lead_id)
        .order_by(CallLog.started_at.desc())
        .all()
    )
