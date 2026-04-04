"""
Due desk aging workbook: static zone balances per row (no automatic phase/timer migration).

Open rows can be replaced on upload; paid rows are kept. All bucket changes are explicit
(edit, swap endpoints, or import)—the server never shifts Safe → Warning over time.
"""
import json
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import delete as sql_delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import require_roles
from ..database import get_db
from ..due_aging_parse import parse_due_aging_xlsx
from ..models import DueAgingMeta, DueAgingRow, User, UserRole
from ..schemas import (
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
)

router = APIRouter(prefix="/due/aging", tags=["due-aging"])

DEFAULT_BUCKETS = ["safe", "warning", "danger", "doubtful"]

ZONE_TO_ATTR = {
    "safe": "amount_safe",
    "warning": "amount_warning",
    "danger": "amount_danger",
    "doubtful": "amount_doubtful",
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


def _row_to_read(r: DueAgingRow) -> DueAgingRowRead:
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
    )


def _recalc_total(row: DueAgingRow) -> None:
    row.amount_total = (
        float(row.amount_safe or 0)
        + float(row.amount_warning or 0)
        + float(row.amount_danger or 0)
        + float(row.amount_doubtful or 0)
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
        reads = [_row_to_read(x) for x in sorted(arr, key=lambda x: (x.sort_order, str(x.id)))]
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
    return _row_to_read(row)


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


@router.delete("/clear-open", status_code=status.HTTP_204_NO_CONTENT)
async def clear_open_rows(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    await db.execute(sql_delete(DueAgingRow).where(DueAgingRow.paid_at.is_(None)))
    m = await _get_meta_row(db)
    if m:
        m.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return None
