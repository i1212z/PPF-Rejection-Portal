import enum
from datetime import datetime, date
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

