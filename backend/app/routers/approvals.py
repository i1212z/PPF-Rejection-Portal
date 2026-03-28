from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import require_roles, get_current_user
from ..database import get_db
from ..models import Approval, RejectionTicket, User, UserRole, TicketStatus, Decision
from ..schemas import ApprovalCreate, ApprovalRead, TicketRead


router = APIRouter(prefix="/approvals", tags=["approvals"])


@router.get("/pending", response_model=list[TicketRead])
async def list_pending_tickets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.MANAGER, UserRole.ADMIN)),
):
    result = await db.execute(
        select(RejectionTicket).where(RejectionTicket.status == TicketStatus.PENDING).order_by(
            RejectionTicket.created_at.asc()
        )
    )
    tickets = result.scalars().unique().all()

    # Build TicketRead objects manually to avoid lazy-loading relationships (creator)
    pending_items = [
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
            rejection_remarks=None,
            approval_remarks=None,
        )
        for t in tickets
    ]

    return pending_items


def _wants_approve(decision: Decision) -> bool:
    v = decision.value if hasattr(decision, "value") else str(decision)
    return str(v).lower() == "approved"


@router.post("/{ticket_id}/decision", response_model=ApprovalRead)
async def decide_ticket(
    ticket_id: UUID,
    payload: ApprovalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.MANAGER, UserRole.ADMIN)),
):
    result = await db.execute(select(RejectionTicket).where(RejectionTicket.id == ticket_id))
    ticket = result.scalars().first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    want_approve = _wants_approve(payload.decision)

    if ticket.status != TicketStatus.PENDING:
        # Idempotent: duplicate click / retry after success should not error.
        if ticket.status == TicketStatus.APPROVED and want_approve:
            ar = await db.execute(select(Approval).where(Approval.ticket_id == ticket.id))
            existing = ar.scalars().first()
            if existing:
                return existing
        if ticket.status == TicketStatus.REJECTED and not want_approve:
            ar = await db.execute(select(Approval).where(Approval.ticket_id == ticket.id))
            existing = ar.scalars().first()
            if existing:
                return existing
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ticket already decided with a different outcome. Use undo in ticket register to change it.",
        )

    approval = Approval(
        ticket_id=ticket.id,
        manager_id=current_user.id,
        decision=payload.decision,
        remarks=payload.remarks,
    )
    ticket.status = TicketStatus.APPROVED if want_approve else TicketStatus.REJECTED

    db.add(approval)
    await db.commit()
    await db.refresh(approval)
    return approval

