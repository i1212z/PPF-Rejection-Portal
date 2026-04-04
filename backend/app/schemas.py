from datetime import datetime, date
from typing import Optional, List, Dict
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from .models import UserRole, TicketStatus, Channel, Decision, CreditNote

CREDIT_NOTE_MARKET_AREAS: frozenset[str] = frozenset(
    {
        "Calicut",
        "Kochi & Kottayam",
        "Karnataka",
        "Chennai",
        "Coimbatore",
        "Ooty Farm",
        "employees",
    },
)


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
    market_area: str
    amount: float = Field(ge=0)
    amount_safe: float = Field(default=0, ge=0)
    amount_warning: float = Field(default=0, ge=0)
    amount_danger: float = Field(default=0, ge=0)
    amount_doubtful: float = Field(default=0, ge=0)

    @field_validator("market_area")
    @classmethod
    def market_area_ok(cls, v: str) -> str:
        t = (v or "").strip()
        if t not in CREDIT_NOTE_MARKET_AREAS:
            allowed = ", ".join(sorted(CREDIT_NOTE_MARKET_AREAS))
            raise ValueError(f"market_area must be one of: {allowed}")
        return t

    @field_validator("customer_name")
    @classmethod
    def customer_name_strip(cls, v: str) -> str:
        return (v or "").strip()


class CreditNoteRead(BaseModel):
    id: UUID
    delivery_date: date
    customer_name: str
    market_area: str
    amount: float
    amount_safe: float
    amount_warning: float
    amount_danger: float
    amount_doubtful: float
    status: TicketStatus
    created_by: UUID
    created_at: datetime
    rejection_remarks: Optional[str] = None
    approval_remarks: Optional[str] = None

    class Config:
        from_attributes = True


def credit_note_to_read(cn: CreditNote, rem: Optional[str] = None) -> CreditNoteRead:
    return CreditNoteRead(
        id=cn.id,
        delivery_date=cn.delivery_date,
        customer_name=cn.customer_name,
        market_area=(cn.market_area or "Calicut").strip() or "Calicut",
        amount=float(cn.amount),
        amount_safe=float(cn.amount_safe or 0),
        amount_warning=float(cn.amount_warning or 0),
        amount_danger=float(cn.amount_danger or 0),
        amount_doubtful=float(cn.amount_doubtful or 0),
        status=cn.status,
        created_by=cn.created_by,
        created_at=cn.created_at,
        rejection_remarks=rem if cn.status == TicketStatus.REJECTED else None,
        approval_remarks=rem,
    )


class DueCreditNoteRow(BaseModel):
    """Approved credit notes for the Due desk (tabular register)."""

    id: UUID
    display_id: str
    particulars: str
    market_area: str
    date: date
    approved_at: datetime
    safe: float
    warning: float
    danger: float
    doubtful: float
    total: float
    phase: str
    timer_label: str
    phase_length_days: int
    paid_at: Optional[datetime] = None
    custom_cells: Dict[str, str] = Field(default_factory=dict)


class DuePhaseLengthBody(BaseModel):
    phase_length_days: int = Field(ge=1, le=30)


class DueReorderNotesBody(BaseModel):
    ordered_credit_note_ids: List[UUID]


class DueCustomColumnCreate(BaseModel):
    label: str = Field(min_length=1, max_length=255)


class DueCustomColumnReorderBody(BaseModel):
    ordered_column_ids: List[UUID]


class DueCellBody(BaseModel):
    column_id: UUID
    value: str = ""


class DueSwapCellsBody(BaseModel):
    credit_note_id_a: UUID
    column_id_a: UUID
    credit_note_id_b: UUID
    column_id_b: UUID


class DueSwapRowsBody(BaseModel):
    credit_note_id_a: UUID
    credit_note_id_b: UUID


class DueAgingMetaRead(BaseModel):
    company_title: str
    date_range_label: str
    bucket_order: List[str]


class DueAgingRowRead(BaseModel):
    id: UUID
    location_group: str
    location_sort: int
    location_label: str
    particulars: str
    safe: float
    warning: float
    danger: float
    doubtful: float
    total: float
    sort_order: int
    paid_at: Optional[datetime] = None
    imported_at: datetime
    source_excel_row: Optional[int] = None
    source_particulars_col: Optional[str] = None
    register_row_index: int = 1


class DueAgingLocationBlock(BaseModel):
    location_group: str
    location_sort: int
    location_label: str
    rows: List[DueAgingRowRead]


class DueAgingTotals(BaseModel):
    safe: float
    warning: float
    danger: float
    doubtful: float
    total: float
    row_count: int


class DueAgingSheetResponse(BaseModel):
    meta: DueAgingMetaRead
    locations: List[DueAgingLocationBlock]
    grand_totals: DueAgingTotals


class DueAgingPatchRowBody(BaseModel):
    particulars: Optional[str] = None
    safe: Optional[float] = None
    warning: Optional[float] = None
    danger: Optional[float] = None
    doubtful: Optional[float] = None
    total: Optional[float] = None


class DueAgingReorderBody(BaseModel):
    location_group: str
    ordered_row_ids: List[UUID]


class DueAgingSwapRowsBody(BaseModel):
    row_id_a: UUID
    row_id_b: UUID


class DueAgingSwapZoneCellsBody(BaseModel):
    row_id_a: UUID
    row_id_b: UUID
    zone: str  # safe | warning | danger | doubtful


class DueAgingBucketOrderBody(BaseModel):
    bucket_order: List[str]


class DueAgingSwapZonesGlobalBody(BaseModel):
    """Swap one zone column with another for all unpaid rows (data move, not just display)."""

    zone_a: str
    zone_b: str


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

