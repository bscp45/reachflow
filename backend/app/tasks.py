"""
tasks.py — Background jobs.

Each task opens its own database session. The web request's session is
closed by the time these run, and a session cannot cross a process boundary
in any case.
"""

import json
import asyncio
import logging
from datetime import datetime, timedelta

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models import (
    Lead, LeadStatus, PipelineStage, CallLog, AuditLog, Client,
)
from app.services.analysis import analyse_transcript, AnalysisUnavailable
from app.services.compliance import now_ist, check_call_allowed
from app.services import vapi

log = logging.getLogger(__name__)

DECLINED_RETRY_DAYS = 30

# Seconds between calls in a batch. Placing them simultaneously risks Vapi's
# concurrency limits, and means a misconfiguration burns credit across fifty
# failed calls before anyone notices.
BATCH_CALL_INTERVAL = 4


# ── Post-call analysis ────────────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    max_retries=3,
    # 30s, 60s, 120s — rate limits and brief outages usually clear in that window
    retry_backoff=30,
    retry_backoff_max=120,
)
def analyse_call(self, call_log_id: int) -> dict:
    """
    Work out what happened on a call and update the lead.

    This is where a lead's final status is decided. The webhook only
    establishes that the call connected; the transcript decides the rest.

    On failure the lead stays in 'calling' with its transcript saved, so a
    person can read it and set the outcome. Deliberately better than
    defaulting to agreed or declined and being wrong.
    """
    db = SessionLocal()
    try:
        call = db.query(CallLog).filter(CallLog.id == call_log_id).first()
        if not call:
            log.warning("analyse_call: call log %s not found", call_log_id)
            return {"ok": False, "reason": "call log not found"}

        lead = db.query(Lead).filter(Lead.id == call.lead_id).first()
        if not lead:
            log.warning("analyse_call: lead %s not found", call.lead_id)
            return {"ok": False, "reason": "lead not found"}

        try:
            result = analyse_transcript(call.transcript or "", lead.name)

        except AnalysisUnavailable as exc:
            if self.request.retries < self.max_retries:
                log.warning(
                    "analyse_call: %s (attempt %s), retrying",
                    exc, self.request.retries + 1,
                )
                raise self.retry(exc=exc)

            log.error("analyse_call: giving up on call %s: %s", call_log_id, exc)
            db.add(AuditLog(
                user_id=None,
                action="call.analysis_failed",
                resource=f"lead:{lead.id}",
                details=json.dumps({
                    "call_log_id": call_log_id,
                    "reason": str(exc),
                    "note": "Lead left in 'calling' for manual review",
                }),
            ))
            db.commit()
            return {"ok": False, "reason": str(exc)}

        call.summary = result.summary
        call.sentiment = result.sentiment

        previous_stage = lead.pipeline_stage

        if result.outcome == "agreed":
            call.status = LeadStatus.agreed
            lead.status = LeadStatus.agreed
            lead.next_retry = None
            # The single automatic stage move. Everything past this is human.
            if lead.pipeline_stage == PipelineStage.not_contacted:
                lead.pipeline_stage = PipelineStage.contacted

        elif result.outcome == "declined":
            call.status = LeadStatus.declined
            lead.status = LeadStatus.declined
            lead.next_retry = (lead.last_called or datetime.utcnow()) + timedelta(
                days=DECLINED_RETRY_DAYS
            )
            lead.pipeline_stage = PipelineStage.declined

        else:
            # Unclear. The call connected and there is a transcript, so this
            # is not a no-answer — it is a judgement for a person to make.
            call.status = LeadStatus.agreed
            lead.status = LeadStatus.agreed
            lead.next_retry = None
            if lead.pipeline_stage == PipelineStage.not_contacted:
                lead.pipeline_stage = PipelineStage.contacted

        lead.score = result.score
        lead.sentiment = result.sentiment

        db.add(AuditLog(
            user_id=None,
            action="call.analysed",
            resource=f"lead:{lead.id}",
            details=json.dumps({
                "call_log_id": call_log_id,
                "outcome": result.outcome,
                "score": result.score,
                "sentiment": result.sentiment,
                "stage_from": previous_stage.value,
                "stage_to": lead.pipeline_stage.value,
            }),
        ))

        db.commit()
        log.info(
            "analyse_call: lead %s -> %s (score %.0f)",
            lead.id, result.outcome, result.score,
        )

        return {
            "ok": True,
            "lead_id": lead.id,
            "outcome": result.outcome,
            "score": result.score,
            "sentiment": result.sentiment,
            "stage": lead.pipeline_stage.value,
        }

    finally:
        db.close()


# ── Batch calling ─────────────────────────────────────────────────────────────

@celery_app.task(bind=True)
def place_batch_calls(self, lead_ids: list[int], started_by_user_id: int) -> dict:
    """
    Place calls for a set of leads, spaced out.

    Leads were validated before this was queued, but conditions change
    between queueing and dialling — the calling window can close partway
    through a long batch, and a lead can be called by someone else. So each
    lead is rechecked immediately before its call.

    One failure does not stop the batch. A single unreachable number should
    not prevent the other forty-nine calls.
    """
    db = SessionLocal()
    placed, skipped, failed = 0, 0, 0

    try:
        for index, lead_id in enumerate(lead_ids):
            lead = db.query(Lead).filter(Lead.id == lead_id).first()
            if not lead:
                skipped += 1
                continue

            # Recheck — the window may have closed since queueing
            compliance = check_call_allowed(lead.phone)
            if not compliance.allowed:
                log.info("Batch: skipping lead %s — %s", lead_id, compliance.reason)
                skipped += 1
                # Window closed mid-batch: stop rather than skip every
                # remaining lead one at a time
                if compliance.retry_after:
                    log.warning(
                        "Batch: calling window closed, %s leads not attempted",
                        len(lead_ids) - index - 1,
                    )
                    break
                continue

            if lead.status == LeadStatus.calling:
                skipped += 1
                continue

            client = db.query(Client).filter(Client.id == lead.client_id).first()

            try:
                # vapi.start_call is async; this task is not
                asyncio.run(vapi.start_call(
                    lead_id=lead.id,
                    phone=lead.phone,
                    lead_name=lead.name,
                    language=lead.language.value if lead.language else "english",
                    client_name=client.name if client else "",
                ))
                lead.status = LeadStatus.calling
                db.commit()
                placed += 1

            except vapi.VapiError as exc:
                log.error("Batch: call failed for lead %s: %s", lead_id, exc)
                db.rollback()
                failed += 1

            # Pace the batch. Skip the wait after the final lead.
            if index < len(lead_ids) - 1:
                import time
                time.sleep(BATCH_CALL_INTERVAL)

        db.add(AuditLog(
            user_id=started_by_user_id,
            action="call.batch_completed",
            resource=f"batch:{len(lead_ids)}",
            details=json.dumps({
                "requested": len(lead_ids),
                "placed": placed,
                "skipped": skipped,
                "failed": failed,
            }),
        ))
        db.commit()

        log.info(
            "Batch complete: %s placed, %s skipped, %s failed",
            placed, skipped, failed,
        )

        return {
            "ok": True,
            "requested": len(lead_ids),
            "placed": placed,
            "skipped": skipped,
            "failed": failed,
        }

    finally:
        db.close()


# ── Health ────────────────────────────────────────────────────────────────────

@celery_app.task
def health_check() -> dict:
    """Confirms the worker is alive and can reach the database."""
    db = SessionLocal()
    try:
        return {
            "ok": True,
            "leads": db.query(Lead).count(),
            "at": now_ist().isoformat(),
        }
    finally:
        db.close()
