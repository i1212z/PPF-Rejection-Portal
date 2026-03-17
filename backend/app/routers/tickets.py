from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import get_current_user, get_current_user_for_ticket_create, require_roles, get_channel_filter_for_user
from ..database import get_db
from ..models import RejectionTicket, User, UserRole, Channel, TicketStatus, Approval, Decision
from ..schemas import TicketCreate, TicketRead, PaginatedTickets


router = APIRouter(prefix="/tickets", tags=["tickets"])


def _role_value(user: User) -> str:
    """Normalize role to string value for comparison (handles enum or string from DB)."""
    r = user.role
    if hasattr(r, "value"):
        return r.value
    return str(r).lower() if r else ""


@router.post("", response_model=TicketRead, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    payload: TicketCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_for_ticket_create),
):
    # Any authenticated user can create tickets. Channel: B2B/B2C from role, else from payload (default B2B).
    rv = _role_value(current_user)
    if rv == "b2b":
        channel = Channel.B2B
    elif rv == "b2c":
        channel = Channel.B2C
    else:
        channel = payload.channel if payload.channel is not None else Channel.B2B

    ticket = RejectionTicket(
        product_name=payload.product_name,
        quantity=payload.quantity,
        uom=(payload.uom or "EA"),
        cost=(payload.cost or 0),
        reason=payload.reason,
        delivery_batch=payload.delivery_batch,
        delivery_date=payload.delivery_date,
        channel=channel,
        status=TicketStatus.PENDING,
        photo_proof_url=payload.photo_proof_url,
        created_by=current_user.id,
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    return ticket


@router.get("", response_model=PaginatedTickets)
async def list_tickets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    status_filter: Optional[TicketStatus] = Query(None, alias="status"),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    channel: Optional[Channel] = Query(None),
    skip: int = 0,
    limit: int = 20,
):
    query = select(RejectionTicket)
    count_query = select(func.count(RejectionTicket.id))

    channel_filter = get_channel_filter_for_user(current_user)
    if channel_filter:
        query = query.where(RejectionTicket.channel == channel_filter)
        count_query = count_query.where(RejectionTicket.channel == channel_filter)
    elif channel:
        query = query.where(RejectionTicket.channel == channel)
        count_query = count_query.where(RejectionTicket.channel == channel)

    if status_filter:
        query = query.where(RejectionTicket.status == status_filter)
        count_query = count_query.where(RejectionTicket.status == status_filter)

    if from_date:
        query = query.where(RejectionTicket.delivery_date >= from_date)
        count_query = count_query.where(RejectionTicket.delivery_date >= from_date)

    if to_date:
        query = query.where(RejectionTicket.delivery_date <= to_date)
        count_query = count_query.where(RejectionTicket.delivery_date <= to_date)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    query = query.order_by(RejectionTicket.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    tickets = result.scalars().unique().all()

    # Fetch approval remarks for all decided tickets for display in UI
    ticket_ids = [t.id for t in tickets]
    remarks_query = select(Approval.ticket_id, Approval.remarks).where(
        Approval.ticket_id.in_(ticket_ids),
    )
    remarks_result = await db.execute(remarks_query)
    approval_remarks_map = {str(r[0]): r[1] for r in remarks_result.all()}

    # Build Pydantic models manually to avoid lazy-loading relationships
    ticket_items = []
    for t in tickets:
        rem = approval_remarks_map.get(str(t.id))
        ticket_items.append(
            TicketRead(
                id=t.id,
                product_name=t.product_name,
                quantity=t.quantity,
                uom=getattr(t, "uom", "EA"),
                cost=float(getattr(t, "cost", 0) or 0),
                reason=t.reason,
                delivery_batch=t.delivery_batch,
                delivery_date=t.delivery_date,
                photo_proof_url=t.photo_proof_url,
                channel=t.channel,
                status=t.status,
                created_by=t.created_by,
                created_at=t.created_at,
                creator=None,
                rejection_remarks=rem if t.status == TicketStatus.REJECTED else None,
                approval_remarks=rem,
            )
        )

    return PaginatedTickets(items=ticket_items, total=total)


@router.get("/{ticket_id}", response_model=TicketRead)
async def get_ticket(
    ticket_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(RejectionTicket).where(RejectionTicket.id == ticket_id)
    channel_filter = get_channel_filter_for_user(current_user)
    if channel_filter:
        query = query.where(RejectionTicket.channel == channel_filter)

    result = await db.execute(query)
    ticket = result.scalars().first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    approval_remarks = None
    approval_result = await db.execute(
        select(Approval.remarks).where(Approval.ticket_id == ticket.id)
    )
    approval_row = approval_result.first()
    if approval_row:
        approval_remarks = approval_row[0]

    return TicketRead(
        id=ticket.id,
        product_name=ticket.product_name,
        quantity=ticket.quantity,
        uom=getattr(ticket, "uom", "EA"),
        cost=float(getattr(ticket, "cost", 0) or 0),
        reason=ticket.reason,
        delivery_batch=ticket.delivery_batch,
        delivery_date=ticket.delivery_date,
        photo_proof_url=ticket.photo_proof_url,
        channel=ticket.channel,
        status=ticket.status,
        created_by=ticket.created_by,
        created_at=ticket.created_at,
        creator=None,
        rejection_remarks=approval_remarks if ticket.status == TicketStatus.REJECTED else None,
        approval_remarks=approval_remarks,
    )


@router.patch("/{ticket_id}", response_model=TicketRead)
async def update_ticket(
    ticket_id: UUID,
    payload: TicketCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
):
    result = await db.execute(select(RejectionTicket).where(RejectionTicket.id == ticket_id))
    ticket = result.scalars().first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    ticket.product_name = payload.product_name
    ticket.quantity = payload.quantity
    ticket.uom = payload.uom or getattr(ticket, "uom", "EA")
    ticket.cost = payload.cost or getattr(ticket, "cost", 0) or 0
    ticket.reason = payload.reason
    ticket.delivery_batch = payload.delivery_batch
    ticket.delivery_date = payload.delivery_date
    ticket.photo_proof_url = payload.photo_proof_url

    await db.commit()
    await db.refresh(ticket)

    approval_remarks = None
    approval_result = await db.execute(
        select(Approval.remarks).where(Approval.ticket_id == ticket.id)
    )
    approval_row = approval_result.first()
    if approval_row:
        approval_remarks = approval_row[0]

    return TicketRead(
        id=ticket.id,
        product_name=ticket.product_name,
        quantity=ticket.quantity,
        uom=getattr(ticket, "uom", "EA"),
        cost=float(getattr(ticket, "cost", 0) or 0),
        reason=ticket.reason,
        delivery_batch=ticket.delivery_batch,
        delivery_date=ticket.delivery_date,
        photo_proof_url=ticket.photo_proof_url,
        channel=ticket.channel,
        status=ticket.status,
        created_by=ticket.created_by,
        created_at=ticket.created_at,
        creator=None,
        rejection_remarks=approval_remarks if ticket.status == TicketStatus.REJECTED else None,
        approval_remarks=approval_remarks,
    )


@router.delete("/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ticket(
    ticket_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
):
    result = await db.execute(select(RejectionTicket).where(RejectionTicket.id == ticket_id))
    ticket = result.scalars().first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    # Delete approval first (FK from approvals.ticket_id -> rejection_tickets.id)
    await db.execute(sql_delete(Approval).where(Approval.ticket_id == ticket_id))
    await db.delete(ticket)
    await db.commit()
    return None

