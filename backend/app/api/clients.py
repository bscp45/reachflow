from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import Client, User, UserRole
from app.schemas import ClientCreate, ClientResponse
from app.core.dependencies import get_current_user, require_super_admin

router = APIRouter(prefix="/api/clients", tags=["clients"])

# ── GET all clients ───────────────────────────────────────────────────────────

@router.get("/", response_model=List[ClientResponse])
def get_clients(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get clients based on role:
    - Super Admin: all clients
    - ReachFlow Manager: assigned clients only
    - Client roles: own client only
    """
    if current_user.role == UserRole.super_admin:
        return db.query(Client).all()

    elif current_user.role == UserRole.reachflow_manager:
        from app.models import ManagerClientAssignment
        assigned = db.query(ManagerClientAssignment.client_id).filter(
            ManagerClientAssignment.manager_id == current_user.id
        ).all()
        assigned_ids = [a.client_id for a in assigned]
        return db.query(Client).filter(Client.id.in_(assigned_ids)).all()

    else:
        # Client roles — own client only
        return db.query(Client).filter(
            Client.id == current_user.client_id
        ).all()

# ── GET single client ─────────────────────────────────────────────────────────

@router.get("/{client_id}", response_model=ClientResponse)
def get_client(
    client_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get single client — enforces access boundary."""
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail=f"Client {client_id} not found")

    # Enforce boundary
    if current_user.role == UserRole.super_admin:
        return client
    elif current_user.role == UserRole.reachflow_manager:
        from app.models import ManagerClientAssignment
        assignment = db.query(ManagerClientAssignment).filter(
            ManagerClientAssignment.manager_id == current_user.id,
            ManagerClientAssignment.client_id == client_id,
        ).first()
        if not assignment:
            raise HTTPException(
                status_code=403,
                detail="Access denied — this client is not assigned to you"
            )
        return client
    else:
        if current_user.client_id != client_id:
            raise HTTPException(
                status_code=403,
                detail="Access denied — you can only access your own company"
            )
        return client

# ── POST create client ────────────────────────────────────────────────────────

@router.post("/", response_model=ClientResponse, status_code=201)
def create_client(
    client_in: ClientCreate,
    current_user: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    Create a new client.
    Only Super Admin can create clients.
    """
    existing = db.query(Client).filter(
        Client.email == client_in.email
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Client with this email already exists"
        )
    client = Client(name=client_in.name, email=client_in.email)
    db.add(client)
    db.commit()
    db.refresh(client)
    return client

# ── DELETE client ─────────────────────────────────────────────────────────────

@router.delete("/{client_id}")
def delete_client(
    client_id: int,
    current_user: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    Delete a client.
    Only Super Admin can delete clients.
    """
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail=f"Client {client_id} not found")
    db.delete(client)
    db.commit()
    return {"message": f"Client {client_id} deleted successfully"}