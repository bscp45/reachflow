from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    Float, ForeignKey, Text, Enum as SAEnum, Index
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

Base = declarative_base()

# ── Enums ─────────────────────────────────────────────────────────────────────

class LeadStatus(enum.Enum):
    """Set by the system when a call finishes. Never set by a person."""
    pending            = "pending"
    pending_approval   = "pending_approval"
    calling            = "calling"
    agreed             = "agreed"
    declined           = "declined"
    no_answer          = "no_answer"


class PipelineStage(enum.Enum):
    """
    Where a lead sits in the sales process.

    The first two are set automatically so they can never disagree with
    status. Everything from 'responded' onward is set by a person.

    The first six appear as columns on the Progress board, in this order.
    The last four are terminal — a lead there is not moving forward, so
    they show as counts beneath the board rather than as columns.
    """
    # Active pipeline, in order
    not_contacted    = "not_contacted"      # uploaded, no call yet — automatic
    contacted        = "contacted"          # call happened — automatic
    responded        = "responded"          # showed interest
    advisor_assigned = "advisor_assigned"   # a human advisor took over
    documents_sent   = "documents_sent"     # paperwork with the lead
    invested         = "invested"           # closed

    # Terminal
    retrying         = "retrying"           # no answer, retry scheduled
    unreachable      = "unreachable"        # retries exhausted
    declined         = "declined"           # said no
    do_not_call      = "do_not_call"        # NDNC or explicit opt-out


class UserRole(enum.Enum):
    super_admin        = "super_admin"
    reachflow_manager  = "reachflow_manager"
    client_owner       = "client_owner"
    client_manager     = "client_manager"
    client_analyst     = "client_analyst"


class Language(enum.Enum):
    english = "english"
    hindi   = "hindi"
    telugu  = "telugu"


# ── Client ────────────────────────────────────────────────────────────────────

class Client(Base):
    __tablename__ = "clients"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(255), nullable=False)
    email      = Column(String(255), unique=True, nullable=False)
    is_active  = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    users       = relationship("User", back_populates="client")
    leads       = relationship("Lead", back_populates="client")
    assignments = relationship("ManagerClientAssignment", back_populates="client")


# ── User ──────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String(255), nullable=False)
    email           = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role            = Column(SAEnum(UserRole), nullable=False)
    is_active       = Column(Boolean, default=True)
    client_id       = Column(Integer, ForeignKey("clients.id"), nullable=True)
    otp_secret      = Column(String(255), nullable=True)
    otp_verified    = Column(Boolean, default=False)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    client      = relationship("Client", back_populates="users")
    permissions = relationship(
        "ClientPermission",
        back_populates="user",
        foreign_keys="ClientPermission.user_id",
    )
    assignments = relationship(
        "ManagerClientAssignment",
        back_populates="manager",
        foreign_keys="ManagerClientAssignment.manager_id",
    )


# ── ManagerClientAssignment ───────────────────────────────────────────────────

class ManagerClientAssignment(Base):
    """
    Which ReachFlow Managers look after which clients.

    Many-to-many on purpose — one manager can hold several clients, and one
    client can be covered by several managers.
    """
    __tablename__ = "manager_client_assignments"

    id          = Column(Integer, primary_key=True, index=True)
    manager_id  = Column(Integer, ForeignKey("users.id"), nullable=False)
    client_id   = Column(Integer, ForeignKey("clients.id"), nullable=False)
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime, default=datetime.utcnow)

    manager = relationship("User", back_populates="assignments", foreign_keys=[manager_id])
    client  = relationship("Client", back_populates="assignments")


# ── ClientPermission ──────────────────────────────────────────────────────────

class ClientPermission(Base):
    """
    Per-user permissions inside a client. Set by the Client Owner, who has
    full freedom within their own company and none outside it.
    """
    __tablename__ = "client_permissions"

    id                   = Column(Integer, primary_key=True, index=True)
    user_id              = Column(Integer, ForeignKey("users.id"), nullable=False)
    client_id            = Column(Integer, ForeignKey("clients.id"), nullable=False)
    can_upload_leads     = Column(Boolean, default=False)
    can_start_campaign   = Column(Boolean, default=False)
    can_view_transcripts = Column(Boolean, default=True)
    can_manage_analysts  = Column(Boolean, default=False)
    can_export_data      = Column(Boolean, default=True)
    granted_by           = Column(Integer, ForeignKey("users.id"), nullable=False)
    granted_at           = Column(DateTime, default=datetime.utcnow)
    updated_at           = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="permissions", foreign_keys=[user_id])


# ── Lead ──────────────────────────────────────────────────────────────────────

class Lead(Base):
    __tablename__ = "leads"

    id             = Column(Integer, primary_key=True, index=True)
    name           = Column(String(255), nullable=False)
    phone          = Column(String(20), nullable=False)

    # Machine-owned: what the AI call produced
    status         = Column(SAEnum(LeadStatus), default=LeadStatus.pending)

    # Human-owned: where the sales team has moved this lead
    pipeline_stage = Column(
        SAEnum(PipelineStage),
        default=PipelineStage.not_contacted,
        nullable=False,
    )

    attempts       = Column(Integer, default=0)
    score          = Column(Float, default=0.0)
    sentiment      = Column(Float, nullable=True)
    language       = Column(SAEnum(Language), default=Language.english)
    last_called    = Column(DateTime, nullable=True)
    next_retry     = Column(DateTime, nullable=True)
    ndnc_checked   = Column(Boolean, default=False)
    is_ndnc        = Column(Boolean, default=False)
    client_id      = Column(Integer, ForeignKey("clients.id"), nullable=False)
    assigned_to    = Column(Integer, ForeignKey("users.id"), nullable=True)
    uploaded_by    = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    client    = relationship("Client", back_populates="leads")
    call_logs = relationship("CallLog", back_populates="lead")

    # The Progress board filters by client then groups by stage
    __table_args__ = (
        Index("ix_leads_client_stage", "client_id", "pipeline_stage"),
    )


# ── CallLog ───────────────────────────────────────────────────────────────────

class CallLog(Base):
    __tablename__ = "call_logs"

    id           = Column(Integer, primary_key=True, index=True)
    lead_id      = Column(Integer, ForeignKey("leads.id"), nullable=False)
    started_at   = Column(DateTime, default=datetime.utcnow)
    ended_at     = Column(DateTime, nullable=True)
    duration     = Column(Integer, nullable=True)   # seconds
    status       = Column(SAEnum(LeadStatus), nullable=False)
    transcript   = Column(Text, nullable=True)
    summary      = Column(Text, nullable=True)
    sentiment    = Column(Float, nullable=True)
    vapi_call_id = Column(String(255), nullable=True)
    language     = Column(SAEnum(Language), default=Language.english)
    created_at   = Column(DateTime, default=datetime.utcnow)

    lead = relationship("Lead", back_populates="call_logs")


# ── AuditLog ──────────────────────────────────────────────────────────────────

class AuditLog(Base):
    """Who did what, and when. Written on every state-changing action."""
    __tablename__ = "audit_logs"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=True)
    action     = Column(String(255), nullable=False)
    resource   = Column(String(255), nullable=False)
    details    = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
