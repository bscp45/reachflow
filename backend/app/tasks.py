"""
tasks.py — Background jobs.

Each task opens its own database session. The webhook's session is closed
by the time these run, and sharing one across process boundaries is not
possible anyway.
"""

import json
import logging
from datetime import datetime, timedelta

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models import Lead, LeadStatus, PipelineStage, CallLog, AuditLog
from app.services.analysis import analyse_transcript, AnalysisUnavailable
from app.services.compliance import now_ist

log = logging.getLogger(__name__)

DECLINED_RETRY_DAYS = 30


@celery_app.task(
    bind=True,
    max_retries=3,
    # 30s, then 60s, then 120s — OpenAI rate limits and brief outages
    # usually clear within that window
    retry_backoff=30,
    retry_backoff_max=120,
)
def analyse_call(self, call_log_id: int) -> dict:
    """
    Work out what happened on a call, and update the lead accordingly.

    This is where a lead's final status is decided. The webhook only
    establishes that the call connected; the transcript decides the rest.

    On failure the lead stays in 'calling' with its transcript saved, so a
    person can read it and set the outcome by hand. That is deliberately
    better than defaulting to agreed or declined and being wrong.
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
            # Retry a few times — most causes are transient
            if self.request.retries < self.max_retries:
                log.warning(
                    "analyse_call: %s (attempt %s), retrying",
                    exc, self.request.retries + 1,
                )
                raise self.retry(exc=exc)

            # Out of retries. Leave the lead for a human rather than guessing.
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

        # ── Record the analysis on the call ───────────────────────────────────
        call.summary = result.summary
        call.sentiment = result.sentiment

        previous_stage = lead.pipeline_stage

        # ── Apply the outcome to the lead ─────────────────────────────────────
        if result.outcome == "agreed":
            call.status = LeadStatus.agreed
            lead.status = LeadStatus.agreed
            lead.next_retry = None
            # The single automatic stage move. Everything beyond this point
            # is set by a person working the lead.
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
            # is not a no-answer — it is a judgement call a person should make.
            call.status = LeadStatus.agreed   # connected; outcome undecided
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


@celery_app.task
def health_check() -> dict:
    """Confirms the worker is alive and can reach the database."""
    db = SessionLocal()
    try:
        count = db.query(Lead).count()
        return {"ok": True, "leads": count, "at": now_ist().isoformat()}
    finally:
        db.close()
