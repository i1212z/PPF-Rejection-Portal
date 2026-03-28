from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import require_roles
from ..database import get_db
from ..models import CreditNote, CreditNoteApproval, User, UserRole, TicketStatus, Decision
from ..schemas import DueCreditNoteRow

router = APIRouter(prefix="/due", tags=["due"])

CN_PREFIX = "CN-B2B"


@router.get("/approved-credit-notes", response_model=list[DueCreditNoteRow])
async def list_approved_credit_notes_for_due(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    """All approved credit notes in tabular form for the Due desk."""
    order_rows = (
        await db.execute(
            select(CreditNote.id).order_by(CreditNote.created_at.asc(), CreditNote.id.asc()),
        )
    ).scalars().all()
    display_map: dict[UUID, str] = {
        cid: f"{CN_PREFIX}-{idx + 1:03d}" for idx, cid in enumerate(order_rows)
    }

    q = (
        select(CreditNote, CreditNoteApproval.approved_at)
        .join(CreditNoteApproval, CreditNoteApproval.credit_note_id == CreditNote.id)
        .where(CreditNote.status == TicketStatus.APPROVED)
        .where(CreditNoteApproval.decision == Decision.APPROVED)
        .order_by(CreditNoteApproval.approved_at.desc())
    )
    result = await db.execute(q)
    out: list[DueCreditNoteRow] = []
    for cn, approved_at in result.all():
        out.append(
            DueCreditNoteRow(
                id=cn.id,
                display_id=display_map.get(cn.id, f"{CN_PREFIX}-???"),
                particulars=cn.customer_name,
                market_area=(cn.market_area or "Calicut").strip() or "Calicut",
                date=cn.delivery_date,
                approved_at=approved_at,
                safe=float(cn.amount_safe or 0),
                warning=float(cn.amount_warning or 0),
                danger=float(cn.amount_danger or 0),
                doubtful=float(cn.amount_doubtful or 0),
                total=float(cn.amount),
            ),
        )
    return out
