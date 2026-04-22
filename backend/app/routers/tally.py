from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import require_roles
from ..database import get_db
from ..models import User, UserRole, TallyPending

router = APIRouter(prefix="/tally", tags=["tally"])


class TallyIds(BaseModel):
    ticket_ids: list[str]


@router.get("/posted", response_model=TallyIds)
async def list_posted_for_tally(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            UserRole.TALLY,
            UserRole.ADMIN,
            UserRole.MANAGER,
            UserRole.B2B,
            UserRole.B2C,
        )
    ),
):
    """List ticket IDs that have been posted to Tally (in tally_pending)."""
    result = await db.execute(select(TallyPending.ticket_id))
    rows = result.scalars().all()
    return TallyIds(ticket_ids=[str(r) for r in rows])


@router.get("/pending", response_model=TallyIds)
async def list_pending_for_tally(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            UserRole.TALLY,
            UserRole.ADMIN,
            UserRole.MANAGER,
            UserRole.B2B,
            UserRole.B2C,
        )
    ),
):
    """Alias for backward compat: same as /posted (ids in tally_pending)."""
    result = await db.execute(select(TallyPending.ticket_id))
    rows = result.scalars().all()
    return TallyIds(ticket_ids=[str(r) for r in rows])


@router.post("/post", status_code=status.HTTP_204_NO_CONTENT)
async def post_to_tally(
    body: TallyIds,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.TALLY, UserRole.ADMIN)),
):
    """Mark one or more tickets as Posted (moves from Pending to Posted)."""
    now = datetime.utcnow()
    for ticket_id_str in body.ticket_ids:
        try:
            ticket_id = UUID(ticket_id_str)
        except ValueError:
            continue
        result = await db.execute(select(TallyPending).where(TallyPending.ticket_id == ticket_id))
        row = result.scalars().first()
        if row is not None:
            if hasattr(row, "posted_at"):
                row.posted_at = now
        else:
            db.add(TallyPending(ticket_id=ticket_id, posted_at=now))
    await db.commit()
    return None


@router.post("/pending", status_code=status.HTTP_204_NO_CONTENT)
async def mark_pending_for_tally(
    body: TallyIds,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.TALLY, UserRole.ADMIN)),
):
    """Mark one or more tickets for Tally. Kept for backward compat."""
    for ticket_id_str in body.ticket_ids:
        try:
            ticket_id = UUID(ticket_id_str)
        except ValueError:
            continue
        existing = await db.execute(select(TallyPending).where(TallyPending.ticket_id == ticket_id))
        if existing.scalars().first() is not None:
            continue
        db.add(TallyPending(ticket_id=ticket_id, posted_at=None))
    await db.commit()
    return None


@router.delete("/pending/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unmark_from_tally(
    ticket_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.TALLY, UserRole.ADMIN)),
):
    """Remove a ticket from Tally (Unpost - moves back to Pending)."""
    result = await db.execute(select(TallyPending).where(TallyPending.ticket_id == ticket_id))
    row = result.scalars().first()
    if row is not None:
        await db.delete(row)
        await db.commit()
    return None
