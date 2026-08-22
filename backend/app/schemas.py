from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from enum import Enum

# ── Enums ─────────────────────────────────────────────────────────────────────

class LeadStatus(str, Enum):
    pending   = "pending"
    calling   = "calling"
    agreed    = "agreed"
    declined  = "declined"
    no_answer = "no_answer"

class UserRole(str, Enum):
    super_admin   = "super_admin"
    client_admin  = "client_admin"
    client_viewer = "client_viewer"

class Language(str, Enum):
    english = "english"
    hindi   = "hindi"
    telugu  = "telugu"

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
    created_at:  datetime

    class Config:
        from_attributes = True

# ── Auth schemas ──────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    name:     str
    email:    str
    password: str
    role:     UserRole
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
    id:           int
    name:         str
    email:        str
    is_active:    bool
    created_at:   datetime

    class Config:
        from_attributes = True