"""
uploads.py — Bulk lead import.

  GET  /api/uploads/template   the CSV users fill in
  POST /api/uploads/leads      upload a filled file

Uploads by a Client Manager land in 'pending_approval' rather than being
callable immediately — the Client Owner releases them. Everyone else's
uploads go straight to 'pending'.
"""

import json
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Lead, LeadStatus, PipelineStage, Language,
    User, UserRole, Client, ManagerClientAssignment, AuditLog,
)
from app.core.dependencies import get_current_user, check_permission
from app.services.leads_import import (
    parse_file, template_csv, phone_digits, ImportError_,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

# Files larger than this are almost certainly not a lead list
MAX_FILE_BYTES = 5 * 1024 * 1024   # 5 MB


class SkippedRow(BaseModel):
    row: int
    reason: str
    detail: str = ""


class UploadResult(BaseModel):
    imported: int
    skipped: List[SkippedRow]
    total_rows: int
    needs_approval: bool
    message: str


@router.get("/template", response_class=PlainTextResponse)
def download_template(current_user: User = Depends(get_current_user)):
    """The CSV template, with example rows showing accepted phone formats."""
    return PlainTextResponse(
        content=template_csv(),
        headers={
            "Content-Disposition": 'attachment; filename="reachflow-leads-template.csv"'
        },
    )


def _resolve_target_client(
    current_user: User,
    requested_client_id: int | None,
    db: Session,
) -> int:
    """
    Which client these leads belong to.

    Client users can only ever upload into their own client, whatever they
    ask for. ReachFlow staff must say which client, and managers are held to
    their assignments.
    """
    if current_user.role in (UserRole.client_owner, UserRole.client_manager,
                             UserRole.client_analyst):
        if not current_user.client_id:
            raise HTTPException(
                status_code=400,
                detail="Your account is not linked to a client",
            )
        return current_user.client_id

    if requested_client_id is None:
        raise HTTPException(
            status_code=400,
            detail="Specify which client these leads belong to",
        )

    client = db.query(Client).filter(Client.id == requested_client_id).first()
    if not client:
        raise HTTPException(
            status_code=404,
            detail=f"Client {requested_client_id} not found",
        )

    if current_user.role == UserRole.reachflow_manager:
        assigned = db.query(ManagerClientAssignment).filter(
            ManagerClientAssignment.manager_id == current_user.id,
            ManagerClientAssignment.client_id == requested_client_id,
        ).first()
        if not assigned:
            raise HTTPException(
                status_code=403,
                detail="That client is not assigned to you",
            )

    return requested_client_id


@router.post("/leads", response_model=UploadResult)
async def upload_leads(
    request: Request,
    file: UploadFile = File(...),
    client_id: int | None = Query(
        None,
        description="Required for ReachFlow staff; ignored for client users",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Import leads from a CSV or Excel file.

    Rows that cannot be used are reported rather than aborting the import,
    and numbers already present for this client are skipped rather than
    duplicated — a second copy of an existing lead would lose its call
    history and could get someone called twice.
    """
    if not check_permission(current_user, "can_upload_leads", db):
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to upload leads",
        )

    target_client_id = _resolve_target_client(current_user, client_id, db)

    content = await file.read()
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File is larger than {MAX_FILE_BYTES // (1024 * 1024)} MB",
        )
    if not content:
        raise HTTPException(status_code=400, detail="The file is empty")

    try:
        parsed = parse_file(file.filename or "", content)
    except ImportError_ as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    skipped: list[SkippedRow] = [
        SkippedRow(row=r.row, reason=r.reason, detail=r.raw)
        for r in parsed.rejected
    ]

    # ── Existing numbers for this client ──────────────────────────────────────
    # Loaded once and compared in memory. One query beats one per row, and a
    # 5000-row file against an existing list is still a trivial set.
    existing = db.query(Lead.phone).filter(Lead.client_id == target_client_id).all()
    existing_digits = {phone_digits(p.phone) for p in existing}

    # A Client Manager's upload waits for the Client Owner to release it.
    # Everyone else's is immediately callable.
    needs_approval = current_user.role == UserRole.client_manager
    initial_status = (
        LeadStatus.pending_approval if needs_approval else LeadStatus.pending
    )

    imported = 0
    for lead_data in parsed.leads:
        if phone_digits(lead_data.phone) in existing_digits:
            skipped.append(SkippedRow(
                row=lead_data.row,
                reason="Already in your leads",
                detail=lead_data.name,
            ))
            continue

        db.add(Lead(
            name=lead_data.name,
            phone=lead_data.phone,
            language=Language(lead_data.language),
            status=initial_status,
            pipeline_stage=PipelineStage.not_contacted,
            client_id=target_client_id,
            uploaded_by=current_user.id,
        ))
        # Guards against the same number appearing twice across chunks
        existing_digits.add(phone_digits(lead_data.phone))
        imported += 1

    db.add(AuditLog(
        user_id=current_user.id,
        action="leads.uploaded",
        resource=f"client:{target_client_id}",
        details=json.dumps({
            "filename": file.filename,
            "imported": imported,
            "skipped": len(skipped),
            "total_rows": parsed.total,
            "needs_approval": needs_approval,
        }),
        ip_address=request.client.host if request.client else None,
    ))

    db.commit()

    if imported == 0:
        message = "No leads were imported — every row was skipped"
    elif needs_approval:
        message = (
            f"{imported} lead{'s' if imported != 1 else ''} uploaded and "
            "waiting for approval before calling can start"
        )
    else:
        message = f"{imported} lead{'s' if imported != 1 else ''} imported"

    if skipped:
        message += f", {len(skipped)} skipped"

    return UploadResult(
        imported=imported,
        skipped=skipped,
        total_rows=parsed.total,
        needs_approval=needs_approval,
        message=message,
    )


@router.post("/approve")
def approve_pending(
    request: Request,
    client_id: int | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Release leads that are waiting for approval.

    Only a Client Owner or above can do this — the point of the hold is that
    somebody more senior than the uploader sees the list before it is called.
    """
    if current_user.role not in (
        UserRole.super_admin, UserRole.reachflow_manager, UserRole.client_owner
    ):
        raise HTTPException(
            status_code=403,
            detail="Only a Client Owner or above can approve uploaded leads",
        )

    target_client_id = _resolve_target_client(current_user, client_id, db)

    pending = db.query(Lead).filter(
        Lead.client_id == target_client_id,
        Lead.status == LeadStatus.pending_approval,
    ).all()

    if not pending:
        return {"approved": 0, "message": "Nothing is waiting for approval"}

    for lead in pending:
        lead.status = LeadStatus.pending

    db.add(AuditLog(
        user_id=current_user.id,
        action="leads.approved",
        resource=f"client:{target_client_id}",
        details=json.dumps({"approved": len(pending)}),
        ip_address=request.client.host if request.client else None,
    ))

    db.commit()

    return {
        "approved": len(pending),
        "message": f"{len(pending)} lead{'s' if len(pending) != 1 else ''} approved",
    }
