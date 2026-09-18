"""
webhooks.py — Receives call results from Vapi.

Vapi posts here when a call ends. This is the only place lead status moves
automatically; everything past 'contacted' is set by a person.

NOTE ON PAYLOAD SHAPE
Vapi's end-of-call report has been read defensively — fields are pulled with
fallbacks rather than assumed. The exact shape should be confirmed against a
real call once an outbound number is provisioned; the raw payload is logged
for that purpose.
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

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

WEBHOOK_SECRET = os.getenv("VAPI_WEBHOOK_SECRET", "")
NO_ANSWER_RETRY_HOURS = int(os.getenv("NO_ANSWER_RETRY_HOURS", "2"))
DECLINED_RETRY_DAYS = int(os.getenv("DECLINED_RETRY_DAYS", "30"))

# After this many failed attempts a lead is considered unreachable
MAX_ATTEMPTS = 4


# ── Outcome mapping ───────────────────────────────────────────────────────────
# Vapi reports why a call ended. These map onto our own status.
# Anything unrecognised is treated as no-answer, which is the safe default —
# it schedules a retry rather than silently marking the lead as finished.

ENDED_REASON_MAP: dict[str, LeadStatus] = {
    # Someone picked up and the conversation ran its course
    "customer-ended-call":        LeadStatus.agreed,
    "assistant-ended-call":       LeadStatus.agreed,
    "assistant-said-end-call-phrase": LeadStatus.agreed,

    # Nobody answered
    "customer-did-not-answer":    LeadStatus.no_answer,
    "customer-busy":              LeadStatus.no_answer,
    "no-answer":                  LeadStatus.no_answer,
    "voicemail":                  LeadStatus.no_answer,
    "customer-did-not-give-microphone-permission": LeadStatus.no_answer,

    # Could not connect at all
    "twilio-failed-to-connect-call": LeadStatus.no_answer,
    "pipeline-error":             LeadStatus.no_answer,
}


def verify_signature(request_secret: str | None) -> None:
    """
    Reject anything not carrying our shared secret.

    This endpoint is public, so without it anyone who found the URL could
    post fabricated call results and corrupt the lead data.

    compare_digest rather than == so the comparison takes constant time and
    cannot be probed character by character.
    """
    if not WEBHOOK_SECRET:
        # Refuse to run unprotected rather than silently accepting everything
        raise HTTPException(
            status_code=500,
            detail="VAPI_WEBHOOK_SECRET is not configured on the server",
        )

    if not request_secret or not hmac.compare_digest(request_secret, WEBHOOK_SECRET):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")


def _first(payload: dict[str, Any], *keys: str, default=None):
    """Return the first key present and non-null. Vapi nests inconsistently."""
    for key in keys:
        if key in payload and payload[key] is not None:
            return payload[key]
    return default


def _resolve_lead(payload: dict, db: Session) -> Lead | None:
    """
    Find the lead this report belongs to.

    Primary route is the lead id we attached as metadata when placing the
    call. Falls back to the Vapi call id recorded on an existing CallLog,
    in case metadata is missing from a particular event shape.
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

    Prefers the structured message list, which can be formatted the same way
    the seeded transcripts are, so the drawer renders both identically.
    Falls back to the flat transcript string.
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
            # 'system' messages are prompt scaffolding, not conversation
        if lines:
            return "\n".join(lines)

    flat = _first(payload, "transcript", default=None)
    return flat if isinstance(flat, str) and flat.strip() else None


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

    # Logged so the real payload shape can be confirmed against a live call
    log.info("Vapi webhook received: type=%s", event_type)
    log.debug("Vapi payload: %s", json.dumps(body)[:4000])

    if event_type != "end-of-call-report":
        return {"received": True, "handled": False, "type": event_type}

    call = message.get("call", message)
    lead = _resolve_lead({**call, **message}, db)

    if not lead:
        # Acknowledged rather than erroring — a report we cannot match is not
        # something Vapi can fix by retrying
        log.warning("End-of-call report could not be matched to a lead")
        return {"received": True, "handled": False, "reason": "lead not found"}

    ended_reason = message.get("endedReason") or message.get("ended_reason") or ""
    status = ENDED_REASON_MAP.get(ended_reason, LeadStatus.no_answer)

    transcript = _extract_transcript({**call, **message})
    summary = _first(message, "summary", default=None)
    duration = _first(message, "durationSeconds", "duration", default=None)
    call_id = _first(call, "id", "callId", default=None)

    started_raw = _first(message, "startedAt", "startedTime", default=None)
    ended_raw = _first(message, "endedAt", "endedTime", default=None)

    def _parse(ts):
        if not ts:
            return None
        try:
            return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        except ValueError:
            return None

    started_at = _parse(started_raw) or datetime.utcnow()
    ended_at = _parse(ended_raw)

    # ── Record the call ───────────────────────────────────────────────────────
    db.add(CallLog(
        lead_id=lead.id,
        started_at=started_at,
        ended_at=ended_at,
        duration=int(duration) if duration else None,
        status=status,
        transcript=transcript,
        summary=summary,
        sentiment=None,          # filled in by the background summariser
        vapi_call_id=call_id,
        language=lead.language or Language.english,
    ))

    # ── Update the lead ───────────────────────────────────────────────────────
    previous_stage = lead.pipeline_stage
    lead.attempts = (lead.attempts or 0) + 1
    lead.last_called = started_at
    lead.status = status

    if status == LeadStatus.agreed:
        lead.next_retry = None
        # The one automatic stage move. Everything beyond this is human.
        if lead.pipeline_stage == PipelineStage.not_contacted:
            lead.pipeline_stage = PipelineStage.contacted

    elif status == LeadStatus.declined:
        lead.next_retry = started_at + timedelta(days=DECLINED_RETRY_DAYS)
        lead.pipeline_stage = PipelineStage.declined

    else:  # no answer
        if lead.attempts >= MAX_ATTEMPTS:
            lead.next_retry = None
            lead.pipeline_stage = PipelineStage.unreachable
        else:
            lead.next_retry = started_at + timedelta(hours=NO_ANSWER_RETRY_HOURS)
            lead.pipeline_stage = PipelineStage.retrying

    db.add(AuditLog(
        user_id=None,            # the system, not a person
        action="call.completed",
        resource=f"lead:{lead.id}",
        details=json.dumps({
            "ended_reason": ended_reason,
            "status": status.value,
            "stage_from": previous_stage.value,
            "stage_to": lead.pipeline_stage.value,
            "attempt": lead.attempts,
            "vapi_call_id": call_id,
        }),
    ))

    db.commit()

    return {
        "received": True,
        "handled": True,
        "lead_id": lead.id,
        "status": status.value,
        "stage": lead.pipeline_stage.value,
        "attempt": lead.attempts,
    }
