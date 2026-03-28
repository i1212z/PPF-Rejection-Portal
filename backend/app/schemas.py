from datetime import datetime, date
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel

from .models import UserRole, TicketStatus, Channel, Decision


class UserBase(BaseModel):
    id: UUID
    name: str
    email: str
    role: UserRole

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: UserRole


class UserRead(UserBase):
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: UUID
    role: UserRole


class TicketBase(BaseModel):
    product_name: str
    quantity: int
    uom: str = "EA"
    cost: float = 0
    reason: str
    delivery_batch: str
    delivery_date: date
    photo_proof_url: Optional[str] = None


class TicketCreate(TicketBase):
    channel: Optional[Channel] = None  # required when created by admin/manager; ignored for B2B/B2C (uses role)


class TicketRead(TicketBase):
    id: UUID
    channel: Channel
    status: TicketStatus
    created_by: UUID
    created_at: datetime
    creator: Optional[UserBase]
    rejection_remarks: Optional[str] = None  # when status is rejected
    approval_remarks: Optional[str] = None  # admin/manager remark when approved or rejected

    class Config:
        from_attributes = True


class ApprovalCreate(BaseModel):
    decision: Decision
    remarks: Optional[str] = None


class ApprovalRead(BaseModel):
    id: UUID
    ticket_id: UUID
    manager_id: UUID
    decision: Decision
    remarks: Optional[str]
    approved_at: datetime
    manager: Optional[UserBase]

    class Config:
        from_attributes = True


class PaginatedTickets(BaseModel):
    items: List[TicketRead]
    total: int


class CreditNoteCreate(BaseModel):
    delivery_date: date
    customer_name: str
    amount: float


class CreditNoteRead(BaseModel):
    id: UUID
    delivery_date: date
    customer_name: str
    amount: float
    status: TicketStatus
    created_by: UUID
    created_at: datetime
    rejection_remarks: Optional[str] = None
    approval_remarks: Optional[str] = None

    class Config:
        from_attributes = True


class PaginatedCreditNotes(BaseModel):
    items: List[CreditNoteRead]
    total: int


class CreditNoteApprovalRead(BaseModel):
    id: UUID
    credit_note_id: UUID
    manager_id: UUID
    decision: Decision
    remarks: Optional[str]
    approved_at: datetime

    class Config:
        from_attributes = True


class CreditNoteTallyIds(BaseModel):
    credit_note_ids: List[str]


class DailyRejectionCostPoint(BaseModel):
    date: date
    total_cost: float


class ChannelComparisonPoint(BaseModel):
    channel: Channel
    total_cost: float


class ProductRejectionPoint(BaseModel):
    product_name: str
    total_cost: float
    total_quantity: int


class MonthlyTrendPoint(BaseModel):
    month: int
    total_cost: float

