import enum
from datetime import datetime, date, timezone
from uuid import uuid4

from sqlalchemy import (
    Column,
    String,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    Integer,
    Date,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from .database import Base


class UserRole(str, enum.Enum):
    B2B = "b2b"
    B2C = "b2c"
    MANAGER = "manager"
    ADMIN = "admin"
    TALLY = "tally"
    DUE = "due"


class TicketStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class Channel(str, enum.Enum):
    B2B = "B2B"
    B2C = "B2C"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(UserRole, name="user_role"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    tickets = relationship("RejectionTicket", back_populates="creator")
    approvals = relationship("Approval", back_populates="manager")


class RejectionTicket(Base):
    __tablename__ = "rejection_tickets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    product_name = Column(String(255), nullable=False)
    quantity = Column(Integer, nullable=False)
    uom = Column(String(16), nullable=False, default="EA")
    # Cost is deprecated in UI but kept for DB compatibility.
    cost = Column(Numeric(12, 2), nullable=False, default=0)
    reason = Column(Text, nullable=False)
    delivery_batch = Column(String(255), nullable=False)
    delivery_date = Column(Date, nullable=False)
    channel = Column(Enum(Channel, name="channel"), nullable=False, index=True)
    status = Column(Enum(TicketStatus, name="ticket_status"), nullable=False, default=TicketStatus.PENDING, index=True)
    photo_proof_url = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)

    creator = relationship("User", back_populates="tickets")
    approval = relationship("Approval", back_populates="ticket", uselist=False)


class Decision(str, enum.Enum):
    APPROVED = "approved"
    REJECTED = "rejected"


class Approval(Base):
    __tablename__ = "approvals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    ticket_id = Column(UUID(as_uuid=True), ForeignKey("rejection_tickets.id"), unique=True, nullable=False)
    manager_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    decision = Column(Enum(Decision, name="decision"), nullable=False)
    remarks = Column(Text, nullable=True)
    approved_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    ticket = relationship("RejectionTicket", back_populates="approval")
    manager = relationship("User", back_populates="approvals")


class TallyPending(Base):
    """Tickets marked by Tally department for update to Tally. posted_at set when Posted."""
    __tablename__ = "tally_pending"

    ticket_id = Column(UUID(as_uuid=True), ForeignKey("rejection_tickets.id"), primary_key=True)
    marked_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    posted_at = Column(DateTime(timezone=True), nullable=True)  # null = pending, set = posted


class CreditNote(Base):
    """B2B credit notes (delivery date, customer, amount). Separate workflow from rejection tickets."""
    __tablename__ = "credit_notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    delivery_date = Column(Date, nullable=False, index=True)
    customer_name = Column(String(255), nullable=False)
    market_area = Column(String(128), nullable=False, default="Calicut")
    amount_safe = Column(Numeric(12, 2), nullable=False, default=0)
    amount_warning = Column(Numeric(12, 2), nullable=False, default=0)
    amount_danger = Column(Numeric(12, 2), nullable=False, default=0)
    amount_doubtful = Column(Numeric(12, 2), nullable=False, default=0)
    amount = Column(Numeric(12, 2), nullable=False)
    status = Column(
        Enum(TicketStatus, name="ticket_status"),
        nullable=False,
        default=TicketStatus.PENDING,
        index=True,
    )
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)

    credit_approval = relationship("CreditNoteApproval", back_populates="credit_note", uselist=False)


class CreditNoteApproval(Base):
    __tablename__ = "credit_note_approvals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    credit_note_id = Column(UUID(as_uuid=True), ForeignKey("credit_notes.id"), unique=True, nullable=False)
    manager_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    decision = Column(Enum(Decision, name="decision"), nullable=False)
    remarks = Column(Text, nullable=True)
    approved_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    credit_note = relationship("CreditNote", back_populates="credit_approval")


class CreditNoteTallyPending(Base):
    __tablename__ = "credit_note_tally_pending"

    credit_note_id = Column(UUID(as_uuid=True), ForeignKey("credit_notes.id"), primary_key=True)
    marked_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    posted_at = Column(DateTime(timezone=True), nullable=True)


class CreditNoteDueTracking(Base):
    """Per approved credit note: Due desk timer phases, row order, paid marker."""

    __tablename__ = "credit_note_due_tracking"

    credit_note_id = Column(
        UUID(as_uuid=True),
        ForeignKey("credit_notes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # Each phase (safe → warning → danger → doubtful) lasts this many days.
    phase_length_days = Column(Integer, nullable=False, default=15)
    sort_order = Column(Integer, nullable=False, default=0)
    paid_at = Column(DateTime(timezone=True), nullable=True)


class DueCustomColumn(Base):
    __tablename__ = "due_custom_columns"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    label = Column(String(255), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)


class DueCustomCell(Base):
    __tablename__ = "due_custom_cells"

    credit_note_id = Column(
        UUID(as_uuid=True),
        ForeignKey("credit_notes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    column_id = Column(
        UUID(as_uuid=True),
        ForeignKey("due_custom_columns.id", ondelete="CASCADE"),
        primary_key=True,
    )
    value = Column(Text, nullable=False, default="")


class DueAgingMeta(Base):
    """Singleton-style workbook header for the Due aging Excel register (one active row)."""

    __tablename__ = "due_aging_meta"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    company_title = Column(String(512), nullable=False, default="")
    date_range_label = Column(String(255), nullable=False, default="")
    bucket_order_json = Column(Text, nullable=False, default='["safe","warning","danger","doubtful"]')
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class DueAgingRow(Base):
    """One customer line from an imported aging sheet (zones + particulars), with paid tracking.

    Zone amounts are stored as-is: there is no time-based migration (e.g. Safe → Warning). Users change
    buckets only by editing, swapping cells, or re-uploading the open register.
    """

    __tablename__ = "due_aging_rows"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    location_group = Column(String(32), nullable=False, index=True)
    location_sort = Column(Integer, nullable=False, default=9)
    location_label = Column(String(255), nullable=False, default="")
    particulars = Column(Text, nullable=False, default="")
    amount_safe = Column(Numeric(14, 2), nullable=False, default=0)
    amount_warning = Column(Numeric(14, 2), nullable=False, default=0)
    amount_danger = Column(Numeric(14, 2), nullable=False, default=0)
    amount_doubtful = Column(Numeric(14, 2), nullable=False, default=0)
    amount_total = Column(Numeric(14, 2), nullable=False, default=0)
    sort_order = Column(Integer, nullable=False, default=0)
    paid_at = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

