from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import Lead, LeadStatus
from app.schemas import LeadCreate, LeadResponse, CampaignStats

router = APIRouter(prefix="/api/leads", tags=["leads"])

@router.get("/", response_model=List[LeadResponse])
def get_leads(skip: int = 0, limit: int = 100, status: Optional[str] = None, client_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Lead)
    if status:
        try:
            lead_status = LeadStatus[status]
            query = query.filter(Lead.status == lead_status)
        except KeyError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    if client_id:
        query = query.filter(Lead.client_id == client_id)
    return query.offset(skip).limit(limit).all()

@router.get("/stats/campaign", response_model=CampaignStats)
def get_campaign_stats(client_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Lead)
    if client_id:
        query = query.filter(Lead.client_id == client_id)
    total = query.count()
    agreed = query.filter(Lead.status == LeadStatus.agreed).count()
    declined = query.filter(Lead.status == LeadStatus.declined).count()
    no_answer = query.filter(Lead.status == LeadStatus.no_answer).count()
    pending = query.filter(Lead.status == LeadStatus.pending).count()
    calling = query.filter(Lead.status == LeadStatus.calling).count()
    return CampaignStats(total=total, called=agreed+declined+no_answer, agreed=agreed, declined=declined, no_answer=no_answer, pending=pending, calling=calling)

@router.get("/{lead_id}", response_model=LeadResponse)
def get_lead(lead_id: int, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail=f"Lead {lead_id} not found")
    return lead

@router.post("/", response_model=LeadResponse, status_code=201)
def create_lead(lead_in: LeadCreate, db: Session = Depends(get_db)):
    lead = Lead(name=lead_in.name, phone=lead_in.phone, language=lead_in.language, client_id=lead_in.client_id)
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead