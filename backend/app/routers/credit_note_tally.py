from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import require_roles
from ..database import get_db
from ..models import User, UserRole, CreditNoteTallyPending
from ..schemas import CreditNoteTallyIds


router = APIRouter(prefix="/credit-note-tally", tags=["credit-note-tally"])


@router.get("/posted", response_model=CreditNoteTallyIds)
async def list_posted_credit_notes_for_tally(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.TALLY, UserRole.ADMIN, UserRole.MANAGER)),
):
    result = await db.execute(select(CreditNoteTallyPending.credit_note_id))
    rows = result.scalars().all()
    return CreditNoteTallyIds(credit_note_ids=[str(r) for r in rows])


@router.get("/pending", response_model=CreditNoteTallyIds)
async def list_pending_credit_note_tally_alias(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.TALLY, UserRole.ADMIN, UserRole.MANAGER)),
):
    result = await db.execute(select(CreditNoteTallyPending.credit_note_id))
    rows = result.scalars().all()
    return CreditNoteTallyIds(credit_note_ids=[str(r) for r in rows])


@router.post("/post", status_code=status.HTTP_204_NO_CONTENT)
async def post_credit_note_to_tally(
    body: CreditNoteTallyIds,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.TALLY, UserRole.ADMIN)),
):
    now = datetime.utcnow()
    for cid_str in body.credit_note_ids or []:
        try:
            cn_id = UUID(cid_str)
        except ValueError:
            continue
        result = await db.execute(
            select(CreditNoteTallyPending).where(CreditNoteTallyPending.credit_note_id == cn_id),
        )
        row = result.scalars().first()
        if row is not None:
            row.posted_at = now
        else:
            db.add(CreditNoteTallyPending(credit_note_id=cn_id, posted_at=now))
    await db.commit()
    return None


@router.delete("/pending/{credit_note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unpost_credit_note_from_tally(
    credit_note_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.TALLY, UserRole.ADMIN)),
):
    result = await db.execute(
        select(CreditNoteTallyPending).where(CreditNoteTallyPending.credit_note_id == credit_note_id),
    )
    row = result.scalars().first()
    if row is not None:
        await db.delete(row)
        await db.commit()
    return None
