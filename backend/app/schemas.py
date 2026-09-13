from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

# ── Enums ─────────────────────────────────────────────────────────────────────

class LeadStatus(str, Enum):
    pending          = "pending"
    pending_approval = "pending_approval"
    calling          = "calling"
    agreed           = "agreed"
    declined         = "declined"
    no_answer        = "no_answer"


class PipelineStage(str, Enum):
    # Active pipeline — these six are the board columns, in order
    not_contacted    = "not_contacted"
    contacted        = "contacted"
    responded        = "responded"
    advisor_assigned = "advisor_assigned"
    documents_sent   = "documents_sent"
    invested         = "invested"
    # Terminal — shown as counts below the board
    retrying         = "retrying"
    unreachable      = "unreachable"
    declined         = "declined"
    do_not_call      = "do_not_call"


# Board columns, in display order
ACTIVE_STAGES: tuple[PipelineStage, ...] = (
    PipelineStage.not_contacted,
    PipelineStage.contacted,
    PipelineStage.responded,
    PipelineStage.advisor_assigned,
    PipelineStage.documents_sent,
    PipelineStage.invested,
)

# Dead ends — a lead here is not moving forward
TERMINAL_STAGES: tuple[PipelineStage, ...] = (
    PipelineStage.retrying,
    PipelineStage.unreachable,
    PipelineStage.declined,
    PipelineStage.do_not_call,
)

# Set by the system when a call completes, never by a person.
# Allowing manual entry would let the pipeline contradict the call record.
SYSTEM_OWNED_STAGES: tuple[PipelineStage, ...] = (
    PipelineStage.not_contacted,
)


class UserRole(str, Enum):
    super_admin       = "super_admin"
    reachflow_manager = "reachflow_manager"
    client_owner      = "client_owner"
    client_manager    = "client_manager"
    client_analyst    = "client_analyst"


class Language(str, Enum):
    english = "english"
    hindi   = "hindi"
    telugu  = "telugu"


# ── Sorting ───────────────────────────────────────────────────────────────────

class LeadSortField(str, Enum):
    name        = "name"
    score       = "score"
    attempts    = "attempts"
    last_called = "last_called"
    created_at  = "created_at"


class SortDirection(str, Enum):
    asc  = "asc"
    desc = "desc"


# ── Lead schemas ──────────────────────────────────────────────────────────────

class LeadCreate(BaseModel):
    name:      str
    phone:     str
    language:  Language = Language.english
    client_id: int


class LeadResponse(BaseModel):
    id:             int
    name:           str
    phone:          str
    status:         LeadStatus
    pipeline_stage: PipelineStage
    attempts:       int
    score:          float
    sentiment:      Optional[float]
    language:       Language
    last_called:    Optional[datetime]
    next_retry:     Optional[datetime]
    client_id:      int
    assigned_to:    Optional[int]
    created_at:     datetime

    class Config:
        from_attributes = True


class PaginatedLeads(BaseModel):
    """Leads plus the total count, so the client can render pagination
    without having fetched every row."""
    items: List[LeadResponse]
    total: int
    skip:  int
    limit: int


class LeadStageUpdate(BaseModel):
    """Move a lead to a different pipeline stage."""
    stage: PipelineStage
    note:  Optional[str] = Field(
        None,
        max_length=500,
        description="Optional reason, recorded in the audit log",
    )


# ── Pipeline board ────────────────────────────────────────────────────────────

class PipelineColumn(BaseModel):
    """One column of the Progress board."""
    stage: PipelineStage
    count: int
    leads: List[LeadResponse]


class TerminalCount(BaseModel):
    """A dead-end stage — count only, no leads listed."""
    stage: PipelineStage
    count: int


class PipelineBoard(BaseModel):
    columns:  List[PipelineColumn]
    terminal: List[TerminalCount]
    total:    int


# ── Call log schemas ──────────────────────────────────────────────────────────

class CallLogResponse(BaseModel):
    id:           int
    lead_id:      int
    started_at:   datetime
    ended_at:     Optional[datetime]
    duration:     Optional[int]
    status:       LeadStatus
    transcript:   Optional[str]
    summary:      Optional[str]
    sentiment:    Optional[float]
    language:     Language
    vapi_call_id: Optional[str]

    class Config:
        from_attributes = True


# ── Auth schemas ──────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    name:      str
    email:     str
    password:  str
    role:      UserRole
    client_id: Optional[int] = None


class UserResponse(BaseModel):
    id:        int
    name:      str
    email:     str
    role:      UserRole
    is_active: bool
    client_id: Optional[int]

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type:   str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[int] = None
    role:    Optional[str] = None


# ── Stats schemas ─────────────────────────────────────────────────────────────

class CampaignStats(BaseModel):
    total:     int
    called:    int
    agreed:    int
    declined:  int
    no_answer: int
    pending:   int
    calling:   int


# ── Client schemas ────────────────────────────────────────────────────────────

class ClientCreate(BaseModel):
    name:  str
    email: str


class ClientResponse(BaseModel):
    id:         int
    name:       str
    email:      str
    is_active:  bool
    created_at: datetime

    class Config:
        from_attributes = True
