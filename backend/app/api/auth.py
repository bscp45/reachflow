from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, UserRole
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    generate_otp_secret,
    generate_otp,
    verify_otp,
)
from app.core.dependencies import get_current_user
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── Request / Response schemas ────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name:      str
    email:     str
    password:  str
    role:      str
    client_id: Optional[int] = None

class LoginRequest(BaseModel):
    email:    str
    password: str

class OTPVerifyRequest(BaseModel):
    email: str
    otp:   str

class LoginResponse(BaseModel):
    message:      str
    requires_otp: bool
    email:        str

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user_id:      int
    name:         str
    role:         str
    client_id:    Optional[int]

class UserResponse(BaseModel):
    id:        int
    name:      str
    email:     str
    role:      str
    client_id: Optional[int]
    is_active: bool

    class Config:
        from_attributes = True

# ── Register ──────────────────────────────────────────────────────────────────

@router.post("/register", response_model=UserResponse, status_code=201)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    """
    Create a new user.
    In production this endpoint will be protected —
    only Super Admin can create ReachFlow staff,
    Client Owner can create their own employees.
    For now it is open for initial setup.
    """
    # Check email not already taken
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )

    # Validate role
    try:
        role = UserRole[req.role]
    except KeyError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role: {req.role}. Must be one of: {[r.value for r in UserRole]}"
        )

    # Generate OTP secret for 2FA
    otp_secret = generate_otp_secret()

    user = User(
        name=req.name,
        email=req.email,
        hashed_password=hash_password(req.password),
        role=role,
        client_id=req.client_id,
        otp_secret=otp_secret,
        otp_verified=False,
    )

    db.add(user)
    db.commit()
    db.refresh(user)
    return user

# ── Login Step 1 — email + password ──────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    """
    Step 1 of 2FA login.
    Verifies email and password.
    If correct, generates OTP and sends it.
    Returns requires_otp: true to tell frontend to show OTP screen.
    """
    user = db.query(User).filter(User.email == req.email).first()

    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is deactivated",
        )

    # Generate OTP
    otp = generate_otp(user.otp_secret)

    # In production — send OTP via SMS (Twilio/MSG91)
    # For now — print to terminal so you can test
    print(f"\n{'='*40}")
    print(f"OTP for {user.email}: {otp}")
    print(f"{'='*40}\n")

    return LoginResponse(
        message="OTP sent to your registered mobile number",
        requires_otp=True,
        email=req.email,
    )

# ── Login Step 2 — OTP verification ──────────────────────────────────────────

@router.post("/verify-otp", response_model=TokenResponse)
def verify_otp_endpoint(req: OTPVerifyRequest, db: Session = Depends(get_db)):
    """
    Step 2 of 2FA login.
    Verifies the OTP entered by user.
    If correct, returns JWT access token.
    """
    user = db.query(User).filter(User.email == req.email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not verify_otp(user.otp_secret, req.otp):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired OTP",
        )

    # Create JWT token
    token_data = {
        "user_id": user.id,
        "role":    user.role.value,
        "client_id": user.client_id,
        "name":    user.name,
    }
    access_token = create_access_token(token_data)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=user.id,
        name=user.name,
        role=user.role.value,
        client_id=user.client_id,
    )

# ── Get current user ──────────────────────────────────────────────────────────

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """
    Returns the currently logged-in user's details.
    Requires valid JWT token in Authorization header.
    """
    return current_user

# ── Change password ───────────────────────────────────────────────────────────

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password:     str

@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change password for the currently logged-in user."""
    if not verify_password(req.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect",
        )

    current_user.hashed_password = hash_password(req.new_password)
    db.commit()

    return {"message": "Password changed successfully"}