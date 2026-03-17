from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import get_current_user, require_roles
from ..database import get_db
from ..models import User, UserRole, TallyPending

router = APIRouter(prefix="/tally", tags=["tally"])


class TallyPendingIds(BaseModel):
    ticket_ids: list[str]


@router.get("/pending", response_model=TallyPendingIds)
async def list_pending_for_tally(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.TALLY, UserRole.ADMIN)),
):
    """List ticket IDs marked for Tally update."""
    result = await db.execute(select(TallyPending.ticket_id))
    rows = result.scalars().all()
    return TallyPendingIds(ticket_ids=[str(r) for r in rows])


@router.post("/pending", status_code=status.HTTP_204_NO_CONTENT)
async def mark_pending_for_tally(
    body: TallyPendingIds,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.TALLY, UserRole.ADMIN)),
):
    """Mark one or more tickets for Tally update."""
    for ticket_id_str in body.ticket_ids:
        try:
            ticket_id = UUID(ticket_id_str)
        except ValueError:
            continue
        existing = await db.execute(select(TallyPending).where(TallyPending.ticket_id == ticket_id))
        if existing.scalars().first() is not None:
            continue
        db.add(TallyPending(ticket_id=ticket_id))
    await db.commit()
    return None


@router.delete("/pending/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unmark_pending_for_tally(
    ticket_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.TALLY, UserRole.ADMIN)),
):
    """Unmark a ticket from Tally update."""
    result = await db.execute(select(TallyPending).where(TallyPending.ticket_id == ticket_id))
    row = result.scalars().first()
    if row is not None:
        await db.delete(row)
        await db.commit()
    return None
