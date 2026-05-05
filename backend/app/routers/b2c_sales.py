from datetime import date
import json
from io import BytesIO
from uuid import UUID

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import require_roles
from ..database import get_db
from ..models import B2CDailyEntry, B2CWorkbookScan, User, UserRole
from ..schemas import (
    B2CDailyEntryCreate,
    B2CDailyEntryRead,
    B2CDailySalesAnalytics,
    B2CLocationSummary,
    B2CWorkbookScanBrief,
    B2CWorkbookScanDetail,
    B2CWorkbookSheetRead,
)

router = APIRouter(prefix="/b2c-sales", tags=["b2c-sales"])


def _role_value(user: User) -> str:
    r = user.role
    if hasattr(r, "value"):
        return str(r.value).lower()
    return str(r).lower() if r else ""


def _safe_cell(v: object) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and pd.isna(v):
        return ""
    return str(v)


def _parse_excel_workbook(file_bytes: bytes) -> list[dict]:
    try:
        workbook = pd.ExcelFile(BytesIO(file_bytes))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read workbook: {e}")

    sheets: list[dict] = []
    for sheet_name in workbook.sheet_names:
        try:
            df = workbook.parse(sheet_name=sheet_name, header=None, dtype=object)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not parse sheet '{sheet_name}': {e}")
        rows_raw = df.values.tolist()
        rows = [[_safe_cell(cell) for cell in row] for row in rows_raw]
        row_count = len(rows)
        col_count = max((len(r) for r in rows), default=0)
        sheets.append(
            {
                "name": sheet_name,
                "rows": rows,
                "row_count": row_count,
                "column_count": col_count,
            }
        )
    return sheets


def _scan_brief(scan: B2CWorkbookScan, *, sheet_count: int) -> B2CWorkbookScanBrief:
    return B2CWorkbookScanBrief(
        id=scan.id,
        source_filename=scan.source_filename or "scan.xlsx",
        file_size=int(scan.file_size or 0),
        sheet_count=sheet_count,
        created_by=scan.created_by,
        created_at=scan.created_at,
    )


def _scan_detail(scan: B2CWorkbookScan) -> B2CWorkbookScanDetail:
    try:
        raw = json.loads(scan.workbook_json or "[]")
    except json.JSONDecodeError:
        raw = []
    sheets = [
        B2CWorkbookSheetRead(
            name=str(item.get("name") or "Sheet"),
            rows=[[str(cell) for cell in row] for row in (item.get("rows") or [])],
            row_count=int(item.get("row_count") or 0),
            column_count=int(item.get("column_count") or 0),
        )
        for item in raw
    ]
    return B2CWorkbookScanDetail(scan=_scan_brief(scan, sheet_count=len(sheets)), sheets=sheets)


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
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
):
    filters = []
    if current_user.role == UserRole.B2C:
        filters.append(B2CDailyEntry.created_by == current_user.id)
    if from_date:
        filters.append(B2CDailyEntry.delivery_date >= from_date)
    if to_date:
        filters.append(B2CDailyEntry.delivery_date <= to_date)

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


@router.post("/scans/upload", response_model=B2CWorkbookScanDetail, status_code=status.HTTP_201_CREATED)
async def upload_b2c_workbook_scan(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.B2C, UserRole.MANAGER, UserRole.ADMIN)),
):
    filename = (file.filename or "scan.xlsx").strip()
    if not filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Upload an Excel .xlsx or .xls file.")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    sheets = _parse_excel_workbook(data)
    if not sheets:
        raise HTTPException(status_code=400, detail="Workbook has no sheets.")

    row = B2CWorkbookScan(
        source_filename=filename,
        workbook_json=json.dumps(sheets, ensure_ascii=False),
        file_bytes=data,
        file_size=len(data),
        created_by=current_user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _scan_detail(row)


@router.get("/scans", response_model=list[B2CWorkbookScanBrief])
async def list_b2c_workbook_scans(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.B2C, UserRole.MANAGER, UserRole.ADMIN)),
):
    query = select(B2CWorkbookScan).order_by(B2CWorkbookScan.created_at.desc())
    if _role_value(current_user) == "b2c":
        query = query.where(B2CWorkbookScan.created_by == current_user.id)
    rows = (await db.execute(query.limit(200))).scalars().all()
    items: list[B2CWorkbookScanBrief] = []
    for row in rows:
        try:
            parsed = json.loads(row.workbook_json or "[]")
            sheet_count = len(parsed) if isinstance(parsed, list) else 0
        except json.JSONDecodeError:
            sheet_count = 0
        items.append(_scan_brief(row, sheet_count=sheet_count))
    return items


@router.get("/scans/{scan_id}", response_model=B2CWorkbookScanDetail)
async def get_b2c_workbook_scan(
    scan_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.B2C, UserRole.MANAGER, UserRole.ADMIN)),
):
    row = (await db.execute(select(B2CWorkbookScan).where(B2CWorkbookScan.id == scan_id))).scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Scan not found.")
    if _role_value(current_user) == "b2c" and row.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return _scan_detail(row)


@router.get("/scans/{scan_id}/download")
async def download_b2c_workbook_scan(
    scan_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.B2C, UserRole.MANAGER, UserRole.ADMIN)),
):
    row = (await db.execute(select(B2CWorkbookScan).where(B2CWorkbookScan.id == scan_id))).scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Scan not found.")
    if _role_value(current_user) == "b2c" and row.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    file_name = (row.source_filename or "scan.xlsx").replace('"', "")
    return StreamingResponse(
        BytesIO(bytes(row.file_bytes or b"")),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
    )


@router.delete("/scans/{scan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_b2c_workbook_scan(
    scan_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.B2C, UserRole.MANAGER, UserRole.ADMIN)),
):
    row = (await db.execute(select(B2CWorkbookScan).where(B2CWorkbookScan.id == scan_id))).scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Scan not found.")
    if _role_value(current_user) == "b2c" and row.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    await db.delete(row)
    await db.commit()
    return None


@router.delete("/scans/{scan_id}/sheets/{sheet_name}", response_model=B2CWorkbookScanDetail)
async def delete_b2c_workbook_sheet(
    scan_id: UUID,
    sheet_name: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.B2C, UserRole.MANAGER, UserRole.ADMIN)),
):
    row = (await db.execute(select(B2CWorkbookScan).where(B2CWorkbookScan.id == scan_id))).scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Scan not found.")
    if _role_value(current_user) == "b2c" and row.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    try:
        parsed = json.loads(row.workbook_json or "[]")
    except json.JSONDecodeError:
        parsed = []
    if not isinstance(parsed, list):
        parsed = []

    kept = [s for s in parsed if str(s.get("name") or "") != sheet_name]
    if len(kept) == len(parsed):
        raise HTTPException(status_code=404, detail="Sheet not found in scan.")
    if not kept:
        raise HTTPException(status_code=400, detail="Cannot remove the last sheet. Delete the scan instead.")

    row.workbook_json = json.dumps(kept, ensure_ascii=False)
    await db.commit()
    await db.refresh(row)
    return _scan_detail(row)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_b2c_daily_entry(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.B2C, UserRole.MANAGER, UserRole.ADMIN)),
):
    try:
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
