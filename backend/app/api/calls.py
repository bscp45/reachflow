"""
calls.py — Call history, and starting calls.

  GET  /api/calls/lead/{id}   the conversation history for one lead
  GET  /api/calls/status      whether calling is possible right now
  POST /api/calls/start       place one call, inline
  POST /api/calls/start-batch queue calls for a set of leads

Single calls run inline so the caller sees the outcome — including why a
call was refused. Batches go through Celery; validating and placing fifty
calls inside one request would time out, and pacing them is the whole point.
"""

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    CallLog, Lead, LeadStatus, PipelineStage,
    User, UserRole, ManagerClientAssignment, AuditLog, Client,
)
from app.schemas import CallLogResponse
from app.core.dependencies import get_current_user, check_permission
from app.services import vapi
from app.services.compliance import (
    check_call_allowed, within_call_window, next_window_open, now_ist,
    CALL_WINDOW_START, CALL_WINDOW_END,
)
from app.tasks import place_batch_calls

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/calls", tags=["calls"])

# A batch larger than this is almost certainly a mistake — a misclick on
# "select all" should not dial a thousand people.
MAX_BATCH_SIZE = 200


# ── Schemas ───────────────────────────────────────────────────────────────────

class CallingStatus(BaseModel):
    """Whether calls can be placed right now, and why not if they cannot."""
    can_call: bool
    reason: str | None = None
    window_opens_at: str | None = None     # ISO, only when currently closed
    window_start_hour: int
    window_end_hour: int
    server_time_ist: str


class StartCallRequest(BaseModel):
    lead_id: int


class StartCallResponse(BaseModel):
    started: bool
    lead_id: int
    vapi_call_id: str | None = None
    message: str


class StartBatchRequest(BaseModel):
    lead_ids: List[int] = Field(..., min_length=1, max_length=MAX_BATCH_SIZE)


class RejectedLead(BaseModel):
    lead_id: int
    name: str | None = None
    reason: str


class StartBatchResponse(BaseModel):
    queued: int
    rejected: List[RejectedLead]
    message: str


# ── Access helpers ────────────────────────────────────────────────────────────

def user_can_see_lead(current_user: User, lead: Lead, db: Session) -> bool:
    """
    Whether this user may see anything about this lead.

    Mirrors the scoping in leads.py. Kept explicit here because call
    transcripts are the most sensitive data in the system — a leak across
    the client boundary would expose a recorded conversation.
    """
    if current_user.role == UserRole.super_admin:
        return True

    if current_user.role == UserRole.reachflow_manager:
        return db.query(ManagerClientAssignment).filter(
            ManagerClientAssignment.manager_id == current_user.id,
            ManagerClientAssignment.client_id == lead.client_id,
        ).first() is not None

    return current_user.client_id == lead.client_id


def lead_not_callable(lead: Lead) -> str | None:
    """
    Reasons a lead cannot be called that have nothing to do with compliance.
    Returns the reason, or None if the lead is callable.
    """
    if lead.status == LeadStatus.calling:
        return "A call to this lead is already in progress"

    if lead.is_ndnc or lead.pipeline_stage == PipelineStage.do_not_call:
        return "This lead is on the do-not-call register"

    if lead.pipeline_stage == PipelineStage.unreachable:
        return "This lead has exhausted its retry attempts"

    if lead.status == LeadStatus.pending_approval:
        return "These leads are waiting for approval before calling can start"

    if not lead.phone or len(lead.phone.replace(" ", "")) < 10:
        return "This lead has no usable phone number"

    return None


# ── Calling status ────────────────────────────────────────────────────────────

@router.get("/status", response_model=CallingStatus)
def calling_status(current_user: User = Depends(get_current_user)):
    """
    Whether calling is possible at this moment.

    The UI needs this because the calling window is a server-side rule the
    browser knows nothing about. Without it, at 10pm every row looks
    callable and every click returns a 409 — the page appears functional
    and nothing works.
    """
    now = now_ist()

    if not within_call_window(now):
        reopen = next_window_open(now)
        return CallingStatus(
            can_call=False,
            reason=(
                f"Outside the permitted calling window "
                f"({CALL_WINDOW_START}:00–{CALL_WINDOW_END}:00 IST). "
                f"Calling resumes {reopen:%d %b at %H:%M}."
            ),
            window_opens_at=reopen.isoformat(),
            window_start_hour=CALL_WINDOW_START,
            window_end_hour=CALL_WINDOW_END,
            server_time_ist=now.isoformat(),
        )

    return CallingStatus(
        can_call=True,
        window_start_hour=CALL_WINDOW_START,
        window_end_hour=CALL_WINDOW_END,
        server_time_ist=now.isoformat(),
    )


# ── Call history ──────────────────────────────────────────────────────────────

@router.get("/lead/{lead_id}", response_model=List[CallLogResponse])
def get_calls_for_lead(
    lead_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Full call history for one lead, newest first.

    A lead called three times returns three records, so the drawer can show
    how the conversation developed rather than only the last attempt.
    """
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail=f"Lead {lead_id} not found")

    if not user_can_see_lead(current_user, lead, db):
        # 404 rather than 403 deliberately — a 403 would confirm the lead
        # exists, which itself leaks across the client boundary
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


# ── Start one call ────────────────────────────────────────────────────────────

@router.post("/start", response_model=StartCallResponse)
async def start_call(
    body: StartCallRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Place a call to one lead, now.

    Runs inline rather than queueing, so the caller sees exactly why a call
    was refused — outside the calling window, on the do-not-call register,
    no outbound number provisioned. A queued job would swallow all of that.
    """
    if not check_permission(current_user, "can_start_campaign", db):
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to start calls",
        )

    lead = db.query(Lead).filter(Lead.id == body.lead_id).first()
    if not lead or not user_can_see_lead(current_user, lead, db):
        raise HTTPException(status_code=404, detail=f"Lead {body.lead_id} not found")

    blocked = lead_not_callable(lead)
    if blocked:
        raise HTTPException(status_code=409, detail=blocked)

    # TRAI checks — window and register. Run immediately before dialling
    # rather than at scheduling time, because the window can close between.
    compliance = check_call_allowed(lead.phone)
    if not compliance.allowed:
        raise HTTPException(status_code=409, detail=compliance.reason)

    client = db.query(Client).filter(Client.id == lead.client_id).first()

    try:
        result = await vapi.start_call(
            lead_id=lead.id,
            phone=lead.phone,
            lead_name=lead.name,
            language=lead.language.value if lead.language else "english",
            client_name=client.name if client else "",
        )
    except vapi.VapiError as exc:
        # 502 — the request was valid, the upstream refused it
        log.error("Vapi call failed for lead %s: %s", lead.id, exc)
        raise HTTPException(status_code=502, detail=str(exc))

    # The result arrives later, via the webhook. This only marks it in flight.
    lead.status = LeadStatus.calling

    db.add(AuditLog(
        user_id=current_user.id,
        action="call.started",
        resource=f"lead:{lead.id}",
        details=f'{{"vapi_call_id": "{result.vapi_call_id}", "mode": "single"}}',
        ip_address=request.client.host if request.client else None,
    ))

    db.commit()

    return StartCallResponse(
        started=True,
        lead_id=lead.id,
        vapi_call_id=result.vapi_call_id,
        message=f"Calling {lead.name}",
    )


# ── Start a batch ─────────────────────────────────────────────────────────────

@router.post("/start-batch", response_model=StartBatchResponse)
def start_batch(
    body: StartBatchRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Queue calls for a set of leads.

    Every lead is validated here, before anything is queued, so the caller
    gets a complete picture of what will and will not be called. The calls
    themselves are placed by a Celery task with a gap between each — firing
    fifty at once is how you exhaust credit and hit rate limits before
    noticing a misconfiguration.
    """
    if not check_permission(current_user, "can_start_campaign", db):
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to start calls",
        )

    # The calling window applies to the whole batch, so check it once
    if not within_call_window():
        reopen = next_window_open()
        raise HTTPException(
            status_code=409,
            detail=(
                f"Outside the permitted calling window "
                f"({CALL_WINDOW_START}:00–{CALL_WINDOW_END}:00 IST). "
                f"Calling resumes {reopen:%d %b at %H:%M}."
            ),
        )

    accepted: list[int] = []
    rejected: list[RejectedLead] = []

    for lead_id in body.lead_ids:
        lead = db.query(Lead).filter(Lead.id == lead_id).first()

        if not lead or not user_can_see_lead(current_user, lead, db):
            rejected.append(RejectedLead(
                lead_id=lead_id, reason="Not found or not accessible",
            ))
            continue

        blocked = lead_not_callable(lead)
        if blocked:
            rejected.append(RejectedLead(
                lead_id=lead_id, name=lead.name, reason=blocked,
            ))
            continue

        per_lead = check_call_allowed(lead.phone)
        if not per_lead.allowed:
            rejected.append(RejectedLead(
                lead_id=lead_id, name=lead.name, reason=per_lead.reason or "Blocked",
            ))
            continue

        accepted.append(lead_id)

    if not accepted:
        raise HTTPException(
            status_code=409,
            detail="None of the selected leads can be called right now",
        )

    db.add(AuditLog(
        user_id=current_user.id,
        action="call.batch_started",
        resource=f"batch:{len(accepted)}",
        details=f'{{"queued": {len(accepted)}, "rejected": {len(rejected)}}}',
        ip_address=request.client.host if request.client else None,
    ))
    db.commit()

    place_batch_calls.delay(accepted, current_user.id)

    return StartBatchResponse(
        queued=len(accepted),
        rejected=rejected,
        message=(
            f"Queued {len(accepted)} call{'s' if len(accepted) != 1 else ''}"
            + (f", {len(rejected)} skipped" if rejected else "")
        ),
    )
