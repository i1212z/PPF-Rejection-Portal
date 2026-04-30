from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import require_roles
from ..database import get_db
from ..models import B2CDailyEntry, User, UserRole
from ..schemas import (
    B2CDailyEntryCreate,
    B2CDailyEntryRead,
    B2CDailySalesAnalytics,
    B2CLocationSummary,
)

router = APIRouter(prefix="/b2c-sales", tags=["b2c-sales"])


@router.post("", response_model=B2CDailyEntryRead)
async def create_b2c_daily_entry(
    payload: B2CDailyEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.B2C, UserRole.MANAGER, UserRole.ADMIN)),
):
    row = B2CDailyEntry(
        delivery_date=payload.delivery_date,
        location=payload.location,
        no_of_order=payload.no_of_order,
        total_sale_value=payload.total_sale_value,
        created_by=current_user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return B2CDailyEntryRead(
        id=row.id,
        delivery_date=row.delivery_date,
        location=row.location,
        no_of_order=int(row.no_of_order or 0),
        total_sale_value=float(row.total_sale_value or 0),
        created_by=row.created_by,
        created_at=row.created_at,
    )


@router.get("", response_model=list[B2CDailyEntryRead])
async def list_b2c_daily_entries(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.B2C, UserRole.MANAGER, UserRole.ADMIN)),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
):
    query = select(B2CDailyEntry)
    if current_user.role == UserRole.B2C:
        query = query.where(B2CDailyEntry.created_by == current_user.id)
    if from_date:
        query = query.where(B2CDailyEntry.delivery_date >= from_date)
    if to_date:
        query = query.where(B2CDailyEntry.delivery_date <= to_date)
    query = query.order_by(B2CDailyEntry.delivery_date.desc(), B2CDailyEntry.created_at.desc()).limit(500)
    result = await db.execute(query)
    rows = result.scalars().all()
    return [
        B2CDailyEntryRead(
            id=r.id,
            delivery_date=r.delivery_date,
            location=r.location,
            no_of_order=int(r.no_of_order or 0),
            total_sale_value=float(r.total_sale_value or 0),
            created_by=r.created_by,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.get("/analytics", response_model=B2CDailySalesAnalytics)
async def b2c_daily_sales_analytics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.B2B, UserRole.B2C, UserRole.MANAGER, UserRole.ADMIN)
    ),
):
    filters = []
    if current_user.role == UserRole.B2C:
        filters.append(B2CDailyEntry.created_by == current_user.id)

    total_result = await db.execute(
        select(
            func.coalesce(func.sum(B2CDailyEntry.no_of_order), 0),
            func.coalesce(func.sum(B2CDailyEntry.total_sale_value), 0),
            func.count(B2CDailyEntry.id),
        ).where(*filters)
    )
    total_orders, total_sale_value, total_entries = total_result.one()

    location_result = await db.execute(
        select(
            B2CDailyEntry.location,
            func.coalesce(func.sum(B2CDailyEntry.no_of_order), 0).label("orders"),
            func.coalesce(func.sum(B2CDailyEntry.total_sale_value), 0).label("sale_value"),
        )
        .where(*filters)
        .group_by(B2CDailyEntry.location)
        .order_by(func.coalesce(func.sum(B2CDailyEntry.total_sale_value), 0).desc())
        .limit(5)
    )
    top_locations = [
        B2CLocationSummary(
            location=str(r.location or "Unknown"),
            orders=int(r.orders or 0),
            sale_value=float(r.sale_value or 0),
        )
        for r in location_result
    ]

    return B2CDailySalesAnalytics(
        total_orders=int(total_orders or 0),
        total_sale_value=float(total_sale_value or 0),
        total_entries=int(total_entries or 0),
        top_locations=top_locations,
    )


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_b2c_daily_entry(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.B2C, UserRole.MANAGER, UserRole.ADMIN)),
):
    try:
        from uuid import UUID
        entry_uuid = UUID(entry_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid entry id")

    result = await db.execute(select(B2CDailyEntry).where(B2CDailyEntry.id == entry_uuid))
    row = result.scalars().first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")

    if current_user.role == UserRole.B2C and row.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    await db.delete(row)
    await db.commit()
    return None
