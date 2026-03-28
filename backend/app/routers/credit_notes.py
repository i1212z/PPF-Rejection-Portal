from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import get_current_user, require_roles
from ..database import get_db
from ..models import (
    User,
    UserRole,
    TicketStatus,
    CreditNote,
    CreditNoteApproval,
    CreditNoteTallyPending,
)
from ..schemas import CreditNoteCreate, CreditNoteRead, PaginatedCreditNotes

router = APIRouter(prefix="/credit-notes", tags=["credit-notes"])


def _role_value(user: User) -> str:
    r = user.role
    if hasattr(r, "value"):
        return r.value
    return str(r).lower() if r else ""


def _require_credit_note_access(user: User) -> None:
    if _role_value(user) not in ("b2b", "manager", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Credit notes are only available for B2B and manager/admin accounts.",
        )


def _to_read(cn: CreditNote, rem: Optional[str]) -> CreditNoteRead:
    return CreditNoteRead(
        id=cn.id,
        delivery_date=cn.delivery_date,
        customer_name=cn.customer_name,
        amount=float(cn.amount),
        status=cn.status,
        created_by=cn.created_by,
        created_at=cn.created_at,
        rejection_remarks=rem if cn.status == TicketStatus.REJECTED else None,
        approval_remarks=rem,
    )


@router.post("", response_model=CreditNoteRead, status_code=status.HTTP_201_CREATED)
async def create_credit_note(
    payload: CreditNoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_credit_note_access(current_user)
    cn = CreditNote(
        delivery_date=payload.delivery_date,
        customer_name=payload.customer_name.strip(),
        amount=Decimal(str(payload.amount)),
        status=TicketStatus.PENDING,
        created_by=current_user.id,
    )
    db.add(cn)
    await db.commit()
    await db.refresh(cn)
    return _to_read(cn, None)


@router.get("", response_model=PaginatedCreditNotes)
async def list_credit_notes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    status_filter: Optional[TicketStatus] = Query(None, alias="status"),
    skip: int = 0,
    limit: int = 100,
):
    _require_credit_note_access(current_user)
    query = select(CreditNote)
    count_query = select(func.count(CreditNote.id))
    rv = _role_value(current_user)
    if rv == "b2b":
        query = query.where(CreditNote.created_by == current_user.id)
        count_query = count_query.where(CreditNote.created_by == current_user.id)
    if status_filter:
        query = query.where(CreditNote.status == status_filter)
        count_query = count_query.where(CreditNote.status == status_filter)
    total = (await db.execute(count_query)).scalar_one()
    query = query.order_by(CreditNote.created_at.desc()).offset(skip).limit(limit)
    rows = (await db.execute(query)).scalars().unique().all()
    ids = [r.id for r in rows]
    remarks_map: dict[str, Optional[str]] = {}
    if ids:
        rq = select(CreditNoteApproval.credit_note_id, CreditNoteApproval.remarks).where(
            CreditNoteApproval.credit_note_id.in_(ids),
        )
        for cid, rem in (await db.execute(rq)).all():
            remarks_map[str(cid)] = rem
    items = [_to_read(r, remarks_map.get(str(r.id))) for r in rows]
    return PaginatedCreditNotes(items=items, total=total)


@router.get("/{credit_note_id}", response_model=CreditNoteRead)
async def get_credit_note(
    credit_note_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_credit_note_access(current_user)
    result = await db.execute(select(CreditNote).where(CreditNote.id == credit_note_id))
    cn = result.scalars().first()
    if not cn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credit note not found")
    rv = _role_value(current_user)
    if rv == "b2b" and cn.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credit note not found")
    rem_row = (
        await db.execute(
            select(CreditNoteApproval.remarks).where(CreditNoteApproval.credit_note_id == cn.id),
        )
    ).first()
    rem = rem_row[0] if rem_row else None
    return _to_read(cn, rem)


@router.post("/{credit_note_id}/revert-to-pending", response_model=CreditNoteRead)
async def revert_credit_note_to_pending(
    credit_note_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.MANAGER, UserRole.ADMIN)),
):
    result = await db.execute(select(CreditNote).where(CreditNote.id == credit_note_id))
    cn = result.scalars().first()
    if not cn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credit note not found")
    if cn.status == TicketStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already pending")
    await db.execute(sql_delete(CreditNoteApproval).where(CreditNoteApproval.credit_note_id == credit_note_id))
    await db.execute(
        sql_delete(CreditNoteTallyPending).where(CreditNoteTallyPending.credit_note_id == credit_note_id),
    )
    cn.status = TicketStatus.PENDING
    await db.commit()
    await db.refresh(cn)
    return _to_read(cn, None)


@router.patch("/{credit_note_id}", response_model=CreditNoteRead)
async def update_credit_note(
    credit_note_id: UUID,
    payload: CreditNoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_credit_note_access(current_user)
    result = await db.execute(select(CreditNote).where(CreditNote.id == credit_note_id))
    cn = result.scalars().first()
    if not cn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credit note not found")
    rv = _role_value(current_user)
    is_mgr = rv in ("admin", "manager")
    is_owner = cn.created_by == current_user.id
    if not is_mgr:
        if not is_owner:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
        if cn.status != TicketStatus.PENDING:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending credit notes can be edited")
    cn.delivery_date = payload.delivery_date
    cn.customer_name = payload.customer_name.strip()
    cn.amount = Decimal(str(payload.amount))
    await db.commit()
    await db.refresh(cn)
    rem_row = (
        await db.execute(
            select(CreditNoteApproval.remarks).where(CreditNoteApproval.credit_note_id == cn.id),
        )
    ).first()
    rem = rem_row[0] if rem_row else None
    return _to_read(cn, rem)


@router.delete("/{credit_note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credit_note(
    credit_note_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_credit_note_access(current_user)
    result = await db.execute(select(CreditNote).where(CreditNote.id == credit_note_id))
    cn = result.scalars().first()
    if not cn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credit note not found")
    rv = _role_value(current_user)
    is_mgr = rv in ("admin", "manager")
    is_owner = cn.created_by == current_user.id
    if not is_mgr:
        if not is_owner:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
        if cn.status != TicketStatus.PENDING:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending credit notes can be deleted")
    await db.execute(sql_delete(CreditNoteApproval).where(CreditNoteApproval.credit_note_id == credit_note_id))
    await db.execute(
        sql_delete(CreditNoteTallyPending).where(CreditNoteTallyPending.credit_note_id == credit_note_id),
    )
    await db.delete(cn)
    await db.commit()
    return None
