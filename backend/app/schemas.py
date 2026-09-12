from pydantic import BaseModel
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
    """Columns the leads list can be sorted by."""
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
    id:          int
    name:        str
    phone:       str
    status:      LeadStatus
    attempts:    int
    score:       float
    sentiment:   Optional[float]
    language:    Language
    last_called: Optional[datetime]
    next_retry:  Optional[datetime]
    client_id:   int
    assigned_to: Optional[int]
    created_at:  datetime

    class Config:
        from_attributes = True

class PaginatedLeads(BaseModel):
    """
    Wraps the leads list with the total row count.

    The frontend needs `total` to work out how many pages exist — without it
    there is no way to render pagination controls when only one page of rows
    has been fetched.
    """
    items: List[LeadResponse]
    total: int
    skip:  int
    limit: int

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
