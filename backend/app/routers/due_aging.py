"""
Due desk aging workbook: static zone balances per row (no automatic phase/timer migration).

Open rows can be replaced on upload; paid rows are kept. All bucket changes are explicit
(edit, swap endpoints, or import)—the server never shifts Safe → Warning over time.
"""
import csv
import json
from datetime import datetime, timezone
from io import BytesIO, StringIO
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import case, delete as sql_delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import require_roles
from ..database import get_db
from ..due_aging_parse import parse_due_aging_xlsx
from ..models import DueAgingAdjustment, DueAgingMeta, DueAgingRow, User, UserRole
from ..schemas import (
    DueAgingAdjustmentRead,
    DueAgingBucketOrderBody,
    DueAgingLocationBlock,
    DueAgingMetaRead,
    DueAgingPatchRowBody,
    DueAgingReorderBody,
    DueAgingRowRead,
    DueAgingSheetResponse,
    DueAgingSwapRowsBody,
    DueAgingSwapZoneCellsBody,
    DueAgingSwapZonesGlobalBody,
    DueAgingTotals,
    DueAgingZoneAdjustBody,
    DueAgingZonePaidBody,
)

router = APIRouter(prefix="/due/aging", tags=["due-aging"])

DEFAULT_BUCKETS = ["safe", "warning", "danger", "doubtful"]

ZONE_TO_ATTR = {
    "safe": "amount_safe",
    "warning": "amount_warning",
    "danger": "amount_danger",
    "doubtful": "amount_doubtful",
}

ZONE_COLOR = {
    "safe": "green",
    "warning": "yellow",
    "danger": "orange",
    "doubtful": "red",
}


def _valid_buckets(order: list[str]) -> list[str]:
    keys = [str(x).strip().lower() for x in order]
    if len(keys) != 4 or set(keys) != set(DEFAULT_BUCKETS):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="bucket_order must be a permutation of safe, warning, danger, doubtful",
        )
    return keys


def _parse_meta_buckets(raw: str | None) -> list[str]:
    if not raw:
        return list(DEFAULT_BUCKETS)
    try:
        data = json.loads(raw)
        if isinstance(data, list) and len(data) == 4:
            k = [str(x).strip().lower() for x in data]
            if set(k) == set(DEFAULT_BUCKETS):
                return k
    except (json.JSONDecodeError, TypeError):
        pass
    return list(DEFAULT_BUCKETS)


async def _get_meta_row(db: AsyncSession) -> DueAgingMeta | None:
    r = await db.execute(select(DueAgingMeta).order_by(DueAgingMeta.updated_at.desc()).limit(1))
    return r.scalars().first()


async def _ensure_meta(db: AsyncSession) -> DueAgingMeta:
    m = await _get_meta_row(db)
    if m:
        return m
    m = DueAgingMeta()
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return m


def _imported_at_aware(r: DueAgingRow) -> datetime:
    ca = r.created_at
    if ca is None:
        return datetime.now(timezone.utc)
    if ca.tzinfo is None:
        return ca.replace(tzinfo=timezone.utc)
    return ca


async def _register_index_in_location(db: AsyncSession, row: DueAgingRow) -> int:
    if row.paid_at is not None:
        cond = DueAgingRow.paid_at.is_not(None)
    else:
        cond = DueAgingRow.paid_at.is_(None)
    q = (
        select(DueAgingRow.id)
        .where(DueAgingRow.location_group == row.location_group)
        .where(cond)
        .order_by(DueAgingRow.sort_order.asc(), DueAgingRow.id.asc())
    )
    ids = (await db.execute(q)).scalars().all()
    for i, rid in enumerate(ids, start=1):
        if rid == row.id:
            return i
    return 1


def _row_to_read(r: DueAgingRow, *, register_row_index: int = 1) -> DueAgingRowRead:
    src_col = getattr(r, "source_particulars_col", None)
    return DueAgingRowRead(
        id=r.id,
        location_group=r.location_group,
        location_sort=r.location_sort,
        location_label=r.location_label,
        particulars=r.particulars,
        safe=float(r.amount_safe or 0),
        warning=float(r.amount_warning or 0),
        danger=float(r.amount_danger or 0),
        doubtful=float(r.amount_doubtful or 0),
        total=float(r.amount_total or 0),
        sort_order=r.sort_order,
        paid_at=r.paid_at,
        imported_at=_imported_at_aware(r),
        source_excel_row=getattr(r, "source_excel_row", None),
        source_particulars_col=src_col,
        register_row_index=register_row_index,
    )


def _recalc_total(row: DueAgingRow) -> None:
    row.amount_total = (
        float(row.amount_safe or 0)
        + float(row.amount_warning or 0)
        + float(row.amount_danger or 0)
        + float(row.amount_doubtful or 0)
    )


def _recalc_paid_flag(row: DueAgingRow) -> None:
    rem = (
        float(row.amount_safe or 0)
        + float(row.amount_warning or 0)
        + float(row.amount_danger or 0)
        + float(row.amount_doubtful or 0)
    )
    if rem <= 0.000001:
        if row.paid_at is None:
            row.paid_at = datetime.now(timezone.utc)
    else:
        row.paid_at = None


def _adj_to_read(a: DueAgingAdjustment) -> DueAgingAdjustmentRead:
    return DueAgingAdjustmentRead(
        id=a.id,
        row_id=a.row_id,
        zone=a.zone,
        action=a.action,
        delta=float(a.delta or 0),
        value_before=float(a.value_before or 0),
        value_after=float(a.value_after or 0),
        note=a.note,
        created_by=a.created_by,
        created_at=a.created_at,
    )


async def _get_row(db: AsyncSession, row_id: UUID) -> DueAgingRow | None:
    r = await db.execute(select(DueAgingRow).where(DueAgingRow.id == row_id))
    return r.scalars().first()


async def _build_sheet(db: AsyncSession, *, paid_only: bool) -> DueAgingSheetResponse:
    m = await _get_meta_row(db)
    bucket_order = _parse_meta_buckets(m.bucket_order_json if m else None)
    meta_read = DueAgingMetaRead(
        company_title=(m.company_title if m else "") or "",
        date_range_label=(m.date_range_label if m else "") or "",
        bucket_order=bucket_order,
    )

    q = select(DueAgingRow)
    if paid_only:
        q = q.where(DueAgingRow.paid_at.is_not(None)).order_by(
            DueAgingRow.paid_at.desc(),
            DueAgingRow.location_sort.asc(),
            DueAgingRow.sort_order.asc(),
        )
    else:
        q = q.where(DueAgingRow.paid_at.is_(None)).order_by(
            DueAgingRow.location_sort.asc(),
            DueAgingRow.location_group.asc(),
            DueAgingRow.sort_order.asc(),
        )
    rows = (await db.execute(q)).scalars().all()

    by_loc: dict[str, list[DueAgingRow]] = {}
    loc_order: list[tuple[int, str]] = []
    for r in rows:
        key = r.location_group
        if key not in by_loc:
            by_loc[key] = []
            loc_order.append((r.location_sort, key))
        by_loc[key].append(r)

    blocks: list[DueAgingLocationBlock] = []
    gt = DueAgingTotals(safe=0.0, warning=0.0, danger=0.0, doubtful=0.0, total=0.0, row_count=0)

    seen_groups: set[str] = set()
    for srt, lg in loc_order:
        if lg in seen_groups:
            continue
        seen_groups.add(lg)
        arr = by_loc[lg]
        if not arr:
            continue
        label = arr[0].location_label
        sorted_rows = sorted(arr, key=lambda x: (x.sort_order, str(x.id)))
        reads = [_row_to_read(x, register_row_index=i) for i, x in enumerate(sorted_rows, start=1)]
        blocks.append(
            DueAgingLocationBlock(
                location_group=lg,
                location_sort=srt,
                location_label=label,
                rows=reads,
            ),
        )
        for x in reads:
            gt.safe += x.safe
            gt.warning += x.warning
            gt.danger += x.danger
            gt.doubtful += x.doubtful
            gt.total += x.total
            gt.row_count += 1

    return DueAgingSheetResponse(meta=meta_read, locations=blocks, grand_totals=gt)


@router.get("/open", response_model=DueAgingSheetResponse)
async def get_open_sheet(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    return await _build_sheet(db, paid_only=False)


@router.get("/paid", response_model=DueAgingSheetResponse)
async def get_paid_sheet(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    return await _build_sheet(db, paid_only=True)


@router.post("/upload", response_model=DueAgingSheetResponse)
async def upload_workbook(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    name = (file.filename or "").lower()
    if not name.endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Upload an Excel .xlsx or .xlsm file.")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")

    try:
        parsed = parse_due_aging_xlsx(data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read workbook: {e!s}") from e

    open_ids = (
        await db.execute(select(DueAgingRow.id).where(DueAgingRow.paid_at.is_(None)))
    ).scalars().all()
    if open_ids:
        await db.execute(sql_delete(DueAgingAdjustment).where(DueAgingAdjustment.row_id.in_(open_ids)))
    await db.execute(sql_delete(DueAgingRow).where(DueAgingRow.paid_at.is_(None)))

    m = await _ensure_meta(db)
    if parsed.company_title:
        m.company_title = parsed.company_title[:512]
    if parsed.date_range_label:
        m.date_range_label = parsed.date_range_label[:255]
    m.updated_at = datetime.now(timezone.utc)

    per_loc: dict[str, int] = {}
    for pr in parsed.rows:
        n = per_loc.get(pr.location_group, 0) + 10
        per_loc[pr.location_group] = n
        col = (pr.source_particulars_col or "")[:8] or None
        db.add(
            DueAgingRow(
                location_group=pr.location_group,
                location_sort=pr.location_sort,
                location_label=pr.location_label[:255],
                particulars=pr.particulars,
                amount_safe=pr.safe,
                amount_warning=pr.warning,
                amount_danger=pr.danger,
                amount_doubtful=pr.doubtful,
                amount_total=pr.total,
                sort_order=n,
                source_excel_row=pr.source_excel_row,
                source_particulars_col=col,
            ),
        )

    await db.commit()
    return await _build_sheet(db, paid_only=False)


@router.patch("/rows/{row_id}", response_model=DueAgingRowRead)
async def patch_row(
    row_id: UUID,
    body: DueAgingPatchRowBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    row = await _get_row(db, row_id)
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")

    if body.particulars is not None:
        row.particulars = body.particulars.strip()
    if body.safe is not None:
        row.amount_safe = body.safe
    if body.warning is not None:
        row.amount_warning = body.warning
    if body.danger is not None:
        row.amount_danger = body.danger
    if body.doubtful is not None:
        row.amount_doubtful = body.doubtful
    if body.total is not None:
        row.amount_total = body.total
    else:
        if any(
            x is not None
            for x in (body.safe, body.warning, body.danger, body.doubtful)
        ):
            _recalc_total(row)

    m = await _ensure_meta(db)
    m.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    idx = await _register_index_in_location(db, row)
    return _row_to_read(row, register_row_index=idx)


@router.get("/rows/{row_id}/history", response_model=list[DueAgingAdjustmentRead])
async def row_adjustment_history(
    row_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    row = await _get_row(db, row_id)
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    q = (
        select(DueAgingAdjustment)
        .where(DueAgingAdjustment.row_id == row_id)
        .order_by(DueAgingAdjustment.created_at.desc(), DueAgingAdjustment.id.desc())
    )
    items = (await db.execute(q)).scalars().all()
    return [_adj_to_read(x) for x in items]


@router.post("/adjustments/{adjustment_id}/undo", response_model=DueAgingRowRead)
async def undo_adjustment(
    adjustment_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    a = (
        await db.execute(select(DueAgingAdjustment).where(DueAgingAdjustment.id == adjustment_id))
    ).scalars().first()
    if not a:
        raise HTTPException(status_code=404, detail="History entry not found")
    if a.action == "undo":
        raise HTTPException(status_code=400, detail="This entry is already an undo action")
    if a.zone not in ZONE_TO_ATTR:
        raise HTTPException(status_code=400, detail="Invalid zone in history entry")

    row = await _get_row(db, a.row_id)
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")

    attr = ZONE_TO_ATTR[a.zone]
    current = float(getattr(row, attr) or 0)
    expected_after = float(a.value_after or 0)
    # Safety: only allow undo when the zone still matches this history step's result.
    if abs(current - expected_after) > 0.000001:
        raise HTTPException(
            status_code=409,
            detail="Undo only works for the latest zone state. Revert newer changes first.",
        )

    before = current
    target = float(a.value_before or 0)
    setattr(row, attr, target)
    _recalc_total(row)
    _recalc_paid_flag(row)

    db.add(
        DueAgingAdjustment(
            row_id=row.id,
            zone=a.zone,
            action="undo",
            delta=(target - before),
            value_before=before,
            value_after=target,
            note=f"Undo {a.action}",
            created_by=current_user.id,
        ),
    )
    m = await _ensure_meta(db)
    m.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    idx = await _register_index_in_location(db, row)
    return _row_to_read(row, register_row_index=idx)


@router.post("/rows/{row_id}/adjust-zone", response_model=DueAgingRowRead)
async def adjust_zone_amount(
    row_id: UUID,
    body: DueAgingZoneAdjustBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    zone = body.zone.strip().lower()
    if zone not in ZONE_TO_ATTR:
        raise HTTPException(status_code=400, detail="zone must be safe, warning, danger, or doubtful")
    row = await _get_row(db, row_id)
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    attr = ZONE_TO_ATTR[zone]
    before = float(getattr(row, attr) or 0)
    delta = float(body.delta or 0)
    if abs(delta) < 0.000001:
        idx = await _register_index_in_location(db, row)
        return _row_to_read(row, register_row_index=idx)
    after = before + delta
    if after < -0.000001:
        raise HTTPException(status_code=400, detail=f"{zone} would go below zero")
    if after < 0:
        after = 0.0
    setattr(row, attr, after)
    _recalc_total(row)
    _recalc_paid_flag(row)
    db.add(
        DueAgingAdjustment(
            row_id=row.id,
            zone=zone,
            action="add" if delta > 0 else "subtract",
            delta=delta,
            value_before=before,
            value_after=after,
            note=(body.note or "").strip() or None,
            created_by=current_user.id,
        ),
    )
    m = await _ensure_meta(db)
    m.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    idx = await _register_index_in_location(db, row)
    return _row_to_read(row, register_row_index=idx)


@router.post("/rows/{row_id}/pay-zone", response_model=DueAgingRowRead)
async def pay_zone_amount(
    row_id: UUID,
    body: DueAgingZonePaidBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    zone = body.zone.strip().lower()
    if zone not in ZONE_TO_ATTR:
        raise HTTPException(status_code=400, detail="zone must be safe, warning, danger, or doubtful")
    row = await _get_row(db, row_id)
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    attr = ZONE_TO_ATTR[zone]
    before = float(getattr(row, attr) or 0)
    if before <= 0.000001:
        idx = await _register_index_in_location(db, row)
        return _row_to_read(row, register_row_index=idx)
    pay_amount = before if body.amount is None else float(body.amount)
    if pay_amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be greater than zero")
    if pay_amount - before > 0.000001:
        raise HTTPException(status_code=400, detail=f"amount exceeds current {zone}")
    after = before - pay_amount
    if after < 0:
        after = 0.0
    setattr(row, attr, after)
    _recalc_total(row)
    _recalc_paid_flag(row)
    note = (body.note or "").strip() or f"Paid from {ZONE_COLOR[zone]} zone"
    db.add(
        DueAgingAdjustment(
            row_id=row.id,
            zone=zone,
            action="paid",
            delta=-pay_amount,
            value_before=before,
            value_after=after,
            note=note,
            created_by=current_user.id,
        ),
    )
    m = await _ensure_meta(db)
    m.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    idx = await _register_index_in_location(db, row)
    return _row_to_read(row, register_row_index=idx)


@router.post("/rows/{row_id}/mark-paid", status_code=status.HTTP_204_NO_CONTENT)
async def mark_row_paid(
    row_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    row = await _get_row(db, row_id)
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    row.paid_at = datetime.now(timezone.utc)
    m = await _ensure_meta(db)
    m.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return None


@router.post("/rows/{row_id}/mark-unpaid", status_code=status.HTTP_204_NO_CONTENT)
async def mark_row_unpaid(
    row_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    row = await _get_row(db, row_id)
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    row.paid_at = None
    m = await _ensure_meta(db)
    m.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return None


@router.put("/open/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_open_rows(
    body: DueAgingReorderBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    if not body.ordered_row_ids:
        return None

    rows: list[DueAgingRow] = []
    for rid in body.ordered_row_ids:
        r = await _get_row(db, rid)
        if not r or r.paid_at is not None:
            raise HTTPException(status_code=400, detail="Invalid or paid row in reorder list")
        if r.location_group != body.location_group:
            raise HTTPException(status_code=400, detail="Row location does not match reorder group")
        rows.append(r)

    for i, r in enumerate(rows):
        r.sort_order = (i + 1) * 10

    m = await _ensure_meta(db)
    m.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return None


@router.post("/swap-rows-order", status_code=status.HTTP_204_NO_CONTENT)
async def swap_rows_order(
    body: DueAgingSwapRowsBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    if body.row_id_a == body.row_id_b:
        return None
    ra = await _get_row(db, body.row_id_a)
    rb = await _get_row(db, body.row_id_b)
    if not ra or not rb:
        raise HTTPException(status_code=404, detail="Row not found")
    if (ra.paid_at is None) != (rb.paid_at is None):
        raise HTTPException(status_code=400, detail="Cannot mix open and paid rows")
    if ra.location_group != rb.location_group:
        raise HTTPException(status_code=400, detail="Rows must be in the same location group")
    ra.sort_order, rb.sort_order = rb.sort_order, ra.sort_order
    m = await _ensure_meta(db)
    m.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return None


@router.post("/swap-rows-data", status_code=status.HTTP_204_NO_CONTENT)
async def swap_rows_data(
    body: DueAgingSwapRowsBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    if body.row_id_a == body.row_id_b:
        return None
    ra = await _get_row(db, body.row_id_a)
    rb = await _get_row(db, body.row_id_b)
    if not ra or not rb:
        raise HTTPException(status_code=404, detail="Row not found")
    if (ra.paid_at is None) != (rb.paid_at is None):
        raise HTTPException(status_code=400, detail="Rows must both be open or both paid")
    fields = [
        "particulars",
        "amount_safe",
        "amount_warning",
        "amount_danger",
        "amount_doubtful",
        "amount_total",
        "source_excel_row",
        "source_particulars_col",
    ]
    for f in fields:
        va = getattr(ra, f)
        setattr(ra, f, getattr(rb, f))
        setattr(rb, f, va)
    m = await _ensure_meta(db)
    m.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return None


@router.post("/swap-zone-cells", status_code=status.HTTP_204_NO_CONTENT)
async def swap_zone_cells(
    body: DueAgingSwapZoneCellsBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    z = body.zone.strip().lower()
    if z not in ZONE_TO_ATTR:
        raise HTTPException(status_code=400, detail="zone must be safe, warning, danger, or doubtful")
    if body.row_id_a == body.row_id_b:
        return None
    ra = await _get_row(db, body.row_id_a)
    rb = await _get_row(db, body.row_id_b)
    if not ra or not rb:
        raise HTTPException(status_code=404, detail="Row not found")
    if (ra.paid_at is None) != (rb.paid_at is None):
        raise HTTPException(status_code=400, detail="Rows must both be open or both paid")
    attr = ZONE_TO_ATTR[z]
    va = getattr(ra, attr)
    setattr(ra, attr, getattr(rb, attr))
    setattr(rb, attr, va)
    _recalc_total(ra)
    _recalc_total(rb)
    m = await _ensure_meta(db)
    m.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return None


@router.put("/bucket-order", response_model=DueAgingMetaRead)
async def put_bucket_order(
    body: DueAgingBucketOrderBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    order = _valid_buckets(body.bucket_order)
    m = await _ensure_meta(db)
    m.bucket_order_json = json.dumps(order)
    m.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(m)
    return DueAgingMetaRead(
        company_title=m.company_title or "",
        date_range_label=m.date_range_label or "",
        bucket_order=order,
    )


@router.post("/swap-zones-global", status_code=status.HTTP_204_NO_CONTENT)
async def swap_zones_global(
    body: DueAgingSwapZonesGlobalBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    a = body.zone_a.strip().lower()
    b = body.zone_b.strip().lower()
    if a not in ZONE_TO_ATTR or b not in ZONE_TO_ATTR or a == b:
        raise HTTPException(status_code=400, detail="zone_a and zone_b must be two distinct zone keys")
    attr_a = ZONE_TO_ATTR[a]
    attr_b = ZONE_TO_ATTR[b]
    r = await db.execute(select(DueAgingRow).where(DueAgingRow.paid_at.is_(None)))
    for row in r.scalars().all():
        va = getattr(row, attr_a)
        setattr(row, attr_a, getattr(row, attr_b))
        setattr(row, attr_b, va)
        _recalc_total(row)
    m = await _ensure_meta(db)
    m.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return None


def _fmt_csv_money(n: float) -> str:
    return f"{float(n):.2f}"


@router.get("/report.csv")
async def aging_workbook_csv(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    """
    Full aging workbook snapshot: all open and paid rows, UTF-8 BOM for Excel,
    plus workbook title/date range and a grand total row.
    """
    m = await _get_meta_row(db)
    title = (m.company_title if m else "") or ""
    dr = (m.date_range_label if m else "") or ""

    q = (
        select(DueAgingRow)
        .order_by(
            DueAgingRow.location_sort.asc(),
            DueAgingRow.location_group.asc(),
            case((DueAgingRow.paid_at.is_(None), 0), else_=1),
            DueAgingRow.sort_order.asc(),
            DueAgingRow.id.asc(),
        )
    )
    rows = (await db.execute(q)).scalars().all()

    buf = StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Due aging workbook export"])
    writer.writerow(["Workbook title", title])
    writer.writerow(["Sheet date range", dr])
    writer.writerow([])

    n_unpaid = sum(1 for r in rows if r.paid_at is None)
    n_paid = sum(1 for r in rows if r.paid_at is not None)
    writer.writerow(["Summary", "", "", "", "", "", "", "", "", "", ""])
    writer.writerow(["Unpaid (open) lines", str(n_unpaid), "", "", "", "", "", "", "", "", ""])
    writer.writerow(["Paid lines", str(n_paid), "", "", "", "", "", "", "", "", ""])
    writer.writerow([])

    us = uw = udg = udb = ut = 0.0
    ps = pw = pdg = pdb = pt = 0.0
    for r in rows:
        s = float(r.amount_safe or 0)
        w = float(r.amount_warning or 0)
        dg = float(r.amount_danger or 0)
        dbf = float(r.amount_doubtful or 0)
        t = float(r.amount_total or 0)
        if r.paid_at is None:
            us += s
            uw += w
            udg += dg
            udb += dbf
            ut += t
        else:
            ps += s
            pw += w
            pdg += dg
            pdb += dbf
            pt += t

    writer.writerow(
        [
            "Subtotal UNPAID only",
            "",
            "",
            "",
            _fmt_csv_money(us),
            _fmt_csv_money(uw),
            _fmt_csv_money(udg),
            _fmt_csv_money(udb),
            _fmt_csv_money(ut),
            "",
            "",
        ],
    )
    writer.writerow(
        [
            "Subtotal PAID only",
            "",
            "",
            "",
            _fmt_csv_money(ps),
            _fmt_csv_money(pw),
            _fmt_csv_money(pdg),
            _fmt_csv_money(pdb),
            _fmt_csv_money(pt),
            "",
            "",
        ],
    )
    writer.writerow([])

    writer.writerow(
        [
            "Location group",
            "Location label",
            "Status",
            "Particulars",
            "Safe",
            "Warning",
            "Danger",
            "Doubtful",
            "Total",
            "Paid at (UTC)",
            "Imported at (UTC)",
        ],
    )

    gs = gw = gdg = gdb = gt = 0.0
    for r in rows:
        status = "Unpaid" if r.paid_at is None else "Paid"
        paid_s = r.paid_at.replace(microsecond=0).isoformat() if r.paid_at else ""
        imp = _imported_at_aware(r).replace(microsecond=0).isoformat()
        s = float(r.amount_safe or 0)
        w = float(r.amount_warning or 0)
        dg = float(r.amount_danger or 0)
        dbf = float(r.amount_doubtful or 0)
        t = float(r.amount_total or 0)
        gs += s
        gw += w
        gdg += dg
        gdb += dbf
        gt += t
        writer.writerow(
            [
                r.location_group,
                r.location_label,
                status,
                r.particulars,
                _fmt_csv_money(s),
                _fmt_csv_money(w),
                _fmt_csv_money(dg),
                _fmt_csv_money(dbf),
                _fmt_csv_money(t),
                paid_s,
                imp,
            ],
        )

    writer.writerow([])
    writer.writerow(
        [
            "GRAND TOTAL (unpaid + paid)",
            "",
            "",
            "",
            _fmt_csv_money(gs),
            _fmt_csv_money(gw),
            _fmt_csv_money(gdg),
            _fmt_csv_money(gdb),
            _fmt_csv_money(gt),
            "",
            "",
        ],
    )

    data = buf.getvalue().encode("utf-8-sig")
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filename = f"due-aging-register-{stamp}.csv"
    return StreamingResponse(
        BytesIO(data),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/clear-open", status_code=status.HTTP_204_NO_CONTENT)
async def clear_open_rows(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    open_ids = (
        await db.execute(select(DueAgingRow.id).where(DueAgingRow.paid_at.is_(None)))
    ).scalars().all()
    if open_ids:
        await db.execute(sql_delete(DueAgingAdjustment).where(DueAgingAdjustment.row_id.in_(open_ids)))
    await db.execute(sql_delete(DueAgingRow).where(DueAgingRow.paid_at.is_(None)))
    m = await _get_meta_row(db)
    if m:
        m.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return None
