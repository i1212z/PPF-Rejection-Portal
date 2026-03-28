from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import require_roles
from ..database import get_db
from ..models import (
    CreditNote,
    CreditNoteApproval,
    User,
    UserRole,
    TicketStatus,
    Decision,
)
from ..schemas import ApprovalCreate, CreditNoteApprovalRead, CreditNoteRead, credit_note_to_read

router = APIRouter(prefix="/credit-note-approvals", tags=["credit-note-approvals"])


def _wants_approve(decision: Decision) -> bool:
    v = decision.value if hasattr(decision, "value") else str(decision)
    return str(v).lower() == "approved"


@router.get("/pending", response_model=list[CreditNoteRead])
async def list_pending_credit_notes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.MANAGER, UserRole.ADMIN)),
):
    result = await db.execute(
        select(CreditNote).where(CreditNote.status == TicketStatus.PENDING).order_by(CreditNote.created_at.asc()),
    )
    notes = result.scalars().unique().all()
    return [credit_note_to_read(n, None) for n in notes]


@router.post("/{credit_note_id}/decision", response_model=CreditNoteApprovalRead)
async def decide_credit_note(
    credit_note_id: UUID,
    payload: ApprovalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.MANAGER, UserRole.ADMIN)),
):
    result = await db.execute(select(CreditNote).where(CreditNote.id == credit_note_id))
    cn = result.scalars().first()
    if not cn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credit note not found")

    want_approve = _wants_approve(payload.decision)

    if cn.status != TicketStatus.PENDING:
        if cn.status == TicketStatus.APPROVED and want_approve:
            ar = await db.execute(
                select(CreditNoteApproval).where(CreditNoteApproval.credit_note_id == cn.id),
            )
            existing = ar.scalars().first()
            if existing:
                return existing
        if cn.status == TicketStatus.REJECTED and not want_approve:
            ar = await db.execute(
                select(CreditNoteApproval).where(CreditNoteApproval.credit_note_id == cn.id),
            )
            existing = ar.scalars().first()
            if existing:
                return existing
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Already decided with a different outcome. Use undo in the credit note register.",
        )

    approval = CreditNoteApproval(
        credit_note_id=cn.id,
        manager_id=current_user.id,
        decision=payload.decision,
        remarks=payload.remarks,
    )
    cn.status = TicketStatus.APPROVED if want_approve else TicketStatus.REJECTED
    db.add(approval)
    await db.commit()
    await db.refresh(approval)
    return approval
