from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.security import decode_access_token
from app.models import User, UserRole, ManagerClientAssignment

# ── Bearer token extractor ────────────────────────────────────────────────────
security = HTTPBearer()

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """
    Extract and validate JWT token from Authorization header.
    Returns the current logged-in user.
    """
    token = credentials.credentials
    payload = decode_access_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return user

# ── Role checkers ─────────────────────────────────────────────────────────────

def require_super_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Only Super Admin can access this endpoint."""
    if current_user.role != UserRole.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin access required",
        )
    return current_user

def require_reachflow_staff(
    current_user: User = Depends(get_current_user),
) -> User:
    """Only ReachFlow staff (Super Admin or Manager) can access."""
    if current_user.role not in [
        UserRole.super_admin,
        UserRole.reachflow_manager,
    ]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ReachFlow staff access required",
        )
    return current_user

def require_client_owner_or_above(
    current_user: User = Depends(get_current_user),
) -> User:
    """Client Owner, ReachFlow Manager, or Super Admin can access."""
    allowed = [
        UserRole.super_admin,
        UserRole.reachflow_manager,
        UserRole.client_owner,
    ]
    if current_user.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Client Owner access or above required",
        )
    return current_user

def require_client_manager_or_above(
    current_user: User = Depends(get_current_user),
) -> User:
    """Client Manager, Client Owner, ReachFlow Manager, or Super Admin."""
    allowed = [
        UserRole.super_admin,
        UserRole.reachflow_manager,
        UserRole.client_owner,
        UserRole.client_manager,
    ]
    if current_user.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Client Manager access or above required",
        )
    return current_user

# ── Client scope enforcer ─────────────────────────────────────────────────────

def get_client_scope(
    current_user: User,
    requested_client_id: int,
    db: Session,
) -> int:
    """
    Enforce client boundary — ensures users can only access allowed clients.

    Super Admin       → can access ANY client, no restrictions
    ReachFlow Manager → can ONLY access clients assigned to them
                        one client can have multiple managers
                        one manager can have multiple clients
    Client roles      → hard-restricted to their OWN client_id only
                        zero exceptions, enforced at every query
    """

    # ── Super Admin — full access everywhere ──────────────────────────────────
    if current_user.role == UserRole.super_admin:
        return requested_client_id

    # ── ReachFlow Manager — assigned clients only ─────────────────────────────
    if current_user.role == UserRole.reachflow_manager:
        assignment = db.query(ManagerClientAssignment).filter(
            ManagerClientAssignment.manager_id == current_user.id,
            ManagerClientAssignment.client_id == requested_client_id,
        ).first()

        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied — this client is not assigned to you",
            )
        return requested_client_id

    # ── All client roles — own client only ────────────────────────────────────
    # This is a hard boundary enforced at the database query level
    # No client user can ever access another client's data
    if current_user.client_id != requested_client_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied — you can only access your own company data",
        )

    return current_user.client_id

# ── Permission checker for client users ──────────────────────────────────────

def check_permission(
    current_user: User,
    permission: str,
    db: Session,
) -> bool:
    """
    Check if a client user has a specific permission.
    Super Admin and ReachFlow Manager always have all permissions.
    Client Owner always has all permissions within their client.
    Client Manager and Client Analyst need explicit permission grant.

    Permissions:
      can_upload_leads
      can_start_campaign
      can_view_transcripts
      can_manage_analysts
      can_export_data
    """
    from app.models import ClientPermission

    # ReachFlow staff and Client Owner always have full permissions
    if current_user.role in [
        UserRole.super_admin,
        UserRole.reachflow_manager,
        UserRole.client_owner,
    ]:
        return True

    # Client Manager and Analyst — check explicit permissions table
    perm = db.query(ClientPermission).filter(
        ClientPermission.user_id == current_user.id,
        ClientPermission.client_id == current_user.client_id,
    ).first()

    if not perm:
        return False

    return getattr(perm, permission, False)