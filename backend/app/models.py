from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    Float, ForeignKey, Text, Enum as SAEnum
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

Base = declarative_base()

# ── Enums ─────────────────────────────────────────────────────────────────────

class LeadStatus(enum.Enum):
    pending    = "pending"
    calling    = "calling"
    agreed     = "agreed"
    declined   = "declined"
    no_answer  = "no_answer"

class UserRole(enum.Enum):
    super_admin   = "super_admin"
    client_admin  = "client_admin"
    client_viewer = "client_viewer"

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

    # Relationships
    users = relationship("User", back_populates="client")
    leads = relationship("Lead", back_populates="client")

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
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    client = relationship("Client", back_populates="users")

# ── Lead ──────────────────────────────────────────────────────────────────────

class Lead(Base):
    __tablename__ = "leads"

    id           = Column(Integer, primary_key=True, index=True)
    name         = Column(String(255), nullable=False)
    phone        = Column(String(20), nullable=False)
    status       = Column(SAEnum(LeadStatus), default=LeadStatus.pending)
    attempts     = Column(Integer, default=0)
    score        = Column(Float, default=0.0)
    sentiment    = Column(Float, nullable=True)
    language     = Column(SAEnum(Language), default=Language.english)
    last_called  = Column(DateTime, nullable=True)
    next_retry   = Column(DateTime, nullable=True)
    ndnc_checked = Column(Boolean, default=False)
    is_ndnc      = Column(Boolean, default=False)
    client_id    = Column(Integer, ForeignKey("clients.id"), nullable=False)
    created_at   = Column(DateTime, default=datetime.utcnow)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    client   = relationship("Client", back_populates="leads")
    call_logs = relationship("CallLog", back_populates="lead")

# ── CallLog ───────────────────────────────────────────────────────────────────

class CallLog(Base):
    __tablename__ = "call_logs"

    id          = Column(Integer, primary_key=True, index=True)
    lead_id     = Column(Integer, ForeignKey("leads.id"), nullable=False)
    started_at  = Column(DateTime, default=datetime.utcnow)
    ended_at    = Column(DateTime, nullable=True)
    duration    = Column(Integer, nullable=True)  # seconds
    status      = Column(SAEnum(LeadStatus), nullable=False)
    transcript  = Column(Text, nullable=True)
    summary     = Column(Text, nullable=True)
    sentiment   = Column(Float, nullable=True)
    vapi_call_id = Column(String(255), nullable=True)
    language    = Column(SAEnum(Language), default=Language.english)
    created_at  = Column(DateTime, default=datetime.utcnow)

    # Relationships
    lead = relationship("Lead", back_populates="call_logs")

# ── AuditLog ──────────────────────────────────────────────────────────────────

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=True)
    action     = Column(String(255), nullable=False)
    resource   = Column(String(255), nullable=False)
    details    = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)