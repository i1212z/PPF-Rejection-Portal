from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth.deps import require_roles
from ..database import get_db
from ..models import Channel, GeneralComplaint, User, UserRole
from ..schemas import GeneralComplaintCreate, GeneralComplaintRead, UserBase


router = APIRouter(prefix="/general-complaints", tags=["general-complaints"])


def _role_value(user: User) -> str:
    r = user.role
    if hasattr(r, "value"):
        return str(r.value).lower()
    return str(r).lower() if r else ""


def _row_to_read(row: GeneralComplaint) -> GeneralComplaintRead:
    creator = None
    if row.creator:
        creator = UserBase(
            id=row.creator.id,
            name=row.creator.name,
            email=row.creator.email,
            role=row.creator.role,
        )
    return GeneralComplaintRead(
        id=row.id,
        channel=row.channel,
        complaint_text=row.complaint_text,
        customer_name=row.customer_name,
        complaint_date=row.complaint_date,
        remark=row.remark,
        created_by=row.created_by,
        created_at=row.created_at,
        creator=creator,
    )


@router.post("", response_model=GeneralComplaintRead)
async def create_general_complaint(
    payload: GeneralComplaintCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.B2B, UserRole.B2C)),
):
    rv = _role_value(current_user)
    channel = Channel.B2B if rv == "b2b" else Channel.B2C
    row = GeneralComplaint(
        channel=channel,
        complaint_text=payload.complaint_text,
        customer_name=payload.customer_name,
        complaint_date=payload.complaint_date,
        remark=payload.remark,
        created_by=current_user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    result = await db.execute(
        select(GeneralComplaint)
        .options(selectinload(GeneralComplaint.creator))
        .where(GeneralComplaint.id == row.id)
    )
    loaded = result.scalars().first()
    return _row_to_read(loaded or row)


@router.get("", response_model=list[GeneralComplaintRead])
async def list_general_complaints(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.B2B, UserRole.B2C, UserRole.MANAGER, UserRole.ADMIN)),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    channel: Channel | None = Query(default=None),
):
    rv = _role_value(current_user)
    query = select(GeneralComplaint).options(selectinload(GeneralComplaint.creator))

    if rv == "b2c":
        query = query.where(
            GeneralComplaint.created_by == current_user.id,
            GeneralComplaint.channel == Channel.B2C,
        )
    elif rv == "b2b":
        query = query.where(
            GeneralComplaint.created_by == current_user.id,
            GeneralComplaint.channel == Channel.B2B,
        )
    elif channel:
        query = query.where(GeneralComplaint.channel == channel)

    if from_date:
        query = query.where(GeneralComplaint.complaint_date >= from_date)
    if to_date:
        query = query.where(GeneralComplaint.complaint_date <= to_date)

    query = query.order_by(GeneralComplaint.complaint_date.desc(), GeneralComplaint.created_at.desc()).limit(500)
    result = await db.execute(query)
    rows = result.scalars().all()
    return [_row_to_read(r) for r in rows]


@router.delete("/{complaint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_general_complaint(
    complaint_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.B2B, UserRole.B2C, UserRole.MANAGER, UserRole.ADMIN)),
):
    try:
        cid = UUID(complaint_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid complaint id")

    result = await db.execute(select(GeneralComplaint).where(GeneralComplaint.id == cid))
    row = result.scalars().first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")

    rv = _role_value(current_user)
    if rv in ("b2b", "b2c"):
        if row.created_by != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    await db.delete(row)
    await db.commit()
    return None
