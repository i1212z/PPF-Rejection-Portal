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
    cost: float
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

