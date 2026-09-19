"""
webhooks.py — Receives call results from Vapi.

WHAT THIS DECIDES, AND WHAT IT DOES NOT

Vapi reports why a call ended, not what was decided on it. A lead who says
"remove my number" and hangs up produces the same endedReason as one who
says "yes, send details" and hangs up — customer-ended-call in both cases.

So this endpoint only establishes whether the call connected:

    connected     -> save the transcript, queue analysis, leave status as
                     'calling' until the transcript has been read
    not connected -> no_answer, schedule a retry, done

The agreed/declined decision belongs to app.tasks.analyse_call, which reads
the transcript.

PAYLOAD SHAPE
Fields are read defensively with fallbacks — the exact shape of Vapi's
end-of-call report should be confirmed against a real call once an outbound
number is provisioned. The raw body is logged at debug level for that.
"""

import os
import json
import hmac
import logging
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Request, HTTPException, Header
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Lead, LeadStatus, PipelineStage, CallLog, Language, AuditLog
from app.tasks import analyse_call

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

WEBHOOK_SECRET = os.getenv("VAPI_WEBHOOK_SECRET", "")
NO_ANSWER_RETRY_HOURS = int(os.getenv("NO_ANSWER_RETRY_HOURS", "2"))

# After this many failed attempts a lead is considered unreachable
MAX_ATTEMPTS = 4

# Reasons that mean a person actually picked up and spoke. Anything else is
# treated as not connected, which schedules a retry rather than closing the
# lead — the safer direction to be wrong in.
CONNECTED_REASONS = {
    "customer-ended-call",
    "assistant-ended-call",
    "assistant-said-end-call-phrase",
    "assistant-forwarded-call",
}


def verify_signature(request_secret: str | None) -> None:
    """
    Reject anything not carrying our shared secret.

    This endpoint is public. Without this, anyone who found the URL could
    post fabricated call results and corrupt the lead data.

    compare_digest rather than == so the comparison runs in constant time
    and cannot be probed character by character.
    """
    if not WEBHOOK_SECRET:
        raise HTTPException(
            status_code=500,
            detail="VAPI_WEBHOOK_SECRET is not configured on the server",
        )

    if not request_secret or not hmac.compare_digest(request_secret, WEBHOOK_SECRET):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")


def _first(payload: dict[str, Any], *keys: str, default=None):
    """First key present and non-null. Vapi nests inconsistently."""
    for key in keys:
        if key in payload and payload[key] is not None:
            return payload[key]
    return default


def _resolve_lead(payload: dict, db: Session) -> Lead | None:
    """
    Find the lead this report belongs to.

    Primary route is the lead id attached as metadata when the call was
    placed. Falls back to matching an existing CallLog on the Vapi call id.
    """
    metadata = _first(payload, "metadata", default={}) or {}
    lead_id = metadata.get("leadId")

    if lead_id:
        lead = db.query(Lead).filter(Lead.id == int(lead_id)).first()
        if lead:
            return lead

    call_id = _first(payload, "id", "callId")
    if call_id:
        existing = db.query(CallLog).filter(CallLog.vapi_call_id == call_id).first()
        if existing:
            return db.query(Lead).filter(Lead.id == existing.lead_id).first()

    return None


def _extract_transcript(payload: dict) -> str | None:
    """
    Pull the conversation out of the report.

    Prefers the structured message list so it can be formatted the same way
    seeded transcripts are, letting the drawer render both identically.
    """
    artifact = _first(payload, "artifact", default={}) or {}
    messages = artifact.get("messages") or payload.get("messages")

    if isinstance(messages, list) and messages:
        lines = []
        for msg in messages:
            role = (msg.get("role") or "").lower()
            content = msg.get("message") or msg.get("content") or ""
            if not content:
                continue
            if role in ("bot", "assistant"):
                lines.append(f"AI: {content}")
            elif role == "user":
                lines.append(f"Lead: {content}")
            # 'system' entries are prompt scaffolding, not conversation
        if lines:
            return "\n".join(lines)

    flat = _first(payload, "transcript", default=None)
    return flat if isinstance(flat, str) and flat.strip() else None


def _parse_time(value) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


@router.post("/vapi")
async def vapi_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_vapi_secret: str | None = Header(default=None, alias="x-vapi-secret"),
):
    """
    Receive a Vapi event.

    Only end-of-call reports are acted on. Other event types are acknowledged
    and ignored — returning an error would make Vapi retry them indefinitely.
    """
    verify_signature(x_vapi_secret)

    body = await request.json()
    message = body.get("message", body)
    event_type = message.get("type")

    log.info("Vapi webhook: type=%s", event_type)
    log.debug("Vapi payload: %s", json.dumps(body)[:4000])

    if event_type != "end-of-call-report":
        return {"received": True, "handled": False, "type": event_type}

    call = message.get("call", message)
    merged = {**call, **message}

    lead = _resolve_lead(merged, db)
    if not lead:
        # Acknowledged rather than erroring — a report we cannot match is
        # not something Vapi can fix by retrying
        log.warning("End-of-call report could not be matched to a lead")
        return {"received": True, "handled": False, "reason": "lead not found"}

    ended_reason = message.get("endedReason") or message.get("ended_reason") or ""
    transcript = _extract_transcript(merged)
    duration = _first(message, "durationSeconds", "duration", default=None)
    call_id = _first(call, "id", "callId", default=None)

    started_at = _parse_time(_first(message, "startedAt", "startedTime")) or datetime.utcnow()
    ended_at = _parse_time(_first(message, "endedAt", "endedTime"))

    # A call counts as connected only if the reason says so *and* there is
    # something to read. A transcript-less "customer-ended-call" means they
    # answered and immediately hung up — nothing to analyse.
    connected = ended_reason in CONNECTED_REASONS and bool(transcript)

    previous_stage = lead.pipeline_stage
    lead.attempts = (lead.attempts or 0) + 1
    lead.last_called = started_at

    if connected:
        # Outcome is undecided until the transcript has been read. 'calling'
        # is the honest state for that.
        interim_status = LeadStatus.calling
        lead.status = LeadStatus.calling
        lead.next_retry = None
    else:
        interim_status = LeadStatus.no_answer
        lead.status = LeadStatus.no_answer
        if lead.attempts >= MAX_ATTEMPTS:
            lead.next_retry = None
            lead.pipeline_stage = PipelineStage.unreachable
        else:
            lead.next_retry = started_at + timedelta(hours=NO_ANSWER_RETRY_HOURS)
            lead.pipeline_stage = PipelineStage.retrying

    call_log = CallLog(
        lead_id=lead.id,
        started_at=started_at,
        ended_at=ended_at,
        duration=int(duration) if duration else None,
        status=interim_status,
        transcript=transcript,
        summary=None,        # written by analyse_call
        sentiment=None,      # written by analyse_call
        vapi_call_id=call_id,
        language=lead.language or Language.english,
    )
    db.add(call_log)
    db.flush()               # need the id to queue the task

    db.add(AuditLog(
        user_id=None,        # the system, not a person
        action="call.completed",
        resource=f"lead:{lead.id}",
        details=json.dumps({
            "ended_reason": ended_reason,
            "connected": connected,
            "attempt": lead.attempts,
            "stage_from": previous_stage.value,
            "stage_to": lead.pipeline_stage.value,
            "vapi_call_id": call_id,
        }),
    ))

    db.commit()

    # Queue after commit — the worker opens its own session and would not
    # see the call log otherwise.
    queued = False
    if connected:
        try:
            analyse_call.delay(call_log.id)
            queued = True
        except Exception as exc:
            # Redis down. The call is saved; the lead sits in 'calling' for
            # a human. Better than failing the webhook and having Vapi retry
            # it, which would duplicate the call log.
            log.error("Could not queue analysis for call %s: %s", call_log.id, exc)

    return {
        "received": True,
        "handled": True,
        "lead_id": lead.id,
        "connected": connected,
        "analysis_queued": queued,
        "stage": lead.pipeline_stage.value,
        "attempt": lead.attempts,
    }
