import csv
from datetime import date, datetime, timezone
from io import BytesIO, StringIO
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import Date as SA_Date, delete as sql_delete, func, or_, select, update
from sqlalchemy.sql import cast
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import require_roles
from ..database import get_db
from ..due_logic import compute_phase_and_buckets
from ..models import (
    CreditNote,
    CreditNoteApproval,
    CreditNoteDueTracking,
    DueCustomCell,
    DueCustomColumn,
    User,
    UserRole,
    TicketStatus,
    Decision,
)
from ..schemas import (
    DueCellBody,
    DueCreditNoteRow,
    DueCustomColumnCreate,
    DueCustomColumnReorderBody,
    DuePhaseLengthBody,
    DueReorderNotesBody,
    DueSwapCellsBody,
    DueSwapRowsBody,
)
from .due_aging import aging_workbook_csv

router = APIRouter(prefix="/due", tags=["due"])

CN_PREFIX = "CN-B2B"


async def _display_id_map(db: AsyncSession) -> dict[UUID, str]:
    order_rows = (
        await db.execute(
            select(CreditNote.id).order_by(CreditNote.created_at.asc(), CreditNote.id.asc()),
        )
    ).scalars().all()
    return {cid: f"{CN_PREFIX}-{idx + 1:03d}" for idx, cid in enumerate(order_rows)}


async def _next_sort_order(db: AsyncSession) -> int:
    r = await db.execute(select(func.max(CreditNoteDueTracking.sort_order)))
    m = r.scalar_one_or_none()
    return (m or 0) + 10


async def _ensure_tracking(db: AsyncSession, credit_note_id: UUID) -> CreditNoteDueTracking:
    r = await db.execute(
        select(CreditNoteDueTracking).where(CreditNoteDueTracking.credit_note_id == credit_note_id),
    )
    tr = r.scalars().first()
    if tr:
        return tr
    tr = CreditNoteDueTracking(
        credit_note_id=credit_note_id,
        phase_length_days=15,
        sort_order=await _next_sort_order(db),
    )
    db.add(tr)
    await db.commit()
    await db.refresh(tr)
    return tr


async def _custom_cells_map(db: AsyncSession, note_ids: list[UUID]) -> dict[UUID, dict[str, str]]:
    if not note_ids:
        return {}
    q = select(DueCustomCell).where(DueCustomCell.credit_note_id.in_(note_ids))
    rows = (await db.execute(q)).scalars().all()
    out: dict[UUID, dict[str, str]] = {}
    for cell in rows:
        out.setdefault(cell.credit_note_id, {})[str(cell.column_id)] = cell.value or ""
    return out


async def _build_rows(
    db: AsyncSession,
    *,
    paid_only: bool,
) -> list[DueCreditNoteRow]:
    display_map = await _display_id_map(db)

    base_where = (
        CreditNote.status == TicketStatus.APPROVED,
        CreditNoteApproval.decision == Decision.APPROVED,
    )

    if paid_only:
        q = (
            select(CreditNote, CreditNoteApproval.approved_at, CreditNoteDueTracking)
            .join(CreditNoteApproval, CreditNoteApproval.credit_note_id == CreditNote.id)
            .join(CreditNoteDueTracking, CreditNoteDueTracking.credit_note_id == CreditNote.id)
            .where(*base_where)
            .where(CreditNoteDueTracking.paid_at.is_not(None))
            .order_by(CreditNoteDueTracking.paid_at.desc())
        )
    else:
        q = (
            select(CreditNote, CreditNoteApproval.approved_at, CreditNoteDueTracking)
            .join(CreditNoteApproval, CreditNoteApproval.credit_note_id == CreditNote.id)
            .outerjoin(CreditNoteDueTracking, CreditNoteDueTracking.credit_note_id == CreditNote.id)
            .where(*base_where)
            .where(
                or_(
                    CreditNoteDueTracking.credit_note_id.is_(None),
                    CreditNoteDueTracking.paid_at.is_(None),
                ),
            )
            .order_by(
                func.coalesce(CreditNoteDueTracking.sort_order, 999999999).asc(),
                CreditNoteApproval.approved_at.desc(),
            )
        )

    result = await db.execute(q)
    raw = result.all()

    out: list[DueCreditNoteRow] = []
    note_ids: list[UUID] = []
    for cn, approved_at, tr in raw:
        note_ids.append(cn.id)
        if tr is None:
            tr = await _ensure_tracking(db, cn.id)
        phase, s, w, dg, dbf, label = compute_phase_and_buckets(
            approved_at,
            tr.paid_at,
            tr.phase_length_days,
            float(cn.amount),
        )
        out.append(
            DueCreditNoteRow(
                id=cn.id,
                display_id=display_map.get(cn.id, f"{CN_PREFIX}-???"),
                particulars=cn.customer_name,
                market_area=(cn.market_area or "Calicut").strip() or "Calicut",
                date=cn.delivery_date,
                approved_at=approved_at,
                safe=s,
                warning=w,
                danger=dg,
                doubtful=dbf,
                total=float(cn.amount),
                phase=phase,
                timer_label=label,
                phase_length_days=tr.phase_length_days,
                paid_at=tr.paid_at,
                custom_cells={},
            ),
        )

    cells = await _custom_cells_map(db, note_ids)
    for row in out:
        row.custom_cells = cells.get(row.id, {})
    return out


@router.get("/approved-credit-notes", response_model=list[DueCreditNoteRow])
async def list_unpaid_due_notes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    return await _build_rows(db, paid_only=False)


@router.get("/paid-credit-notes", response_model=list[DueCreditNoteRow])
async def list_paid_due_notes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    return await _build_rows(db, paid_only=True)


@router.get("/custom-columns", response_model=list[dict])
async def list_custom_columns(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    q = select(DueCustomColumn).order_by(DueCustomColumn.sort_order.asc(), DueCustomColumn.label.asc())
    cols = (await db.execute(q)).scalars().all()
    return [{"id": str(c.id), "label": c.label} for c in cols]


@router.post("/custom-columns", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_custom_column(
    body: DueCustomColumnCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    r = await db.execute(select(func.max(DueCustomColumn.sort_order)))
    mx = r.scalar_one_or_none() or 0
    col = DueCustomColumn(label=body.label.strip(), sort_order=mx + 10)
    db.add(col)
    await db.commit()
    await db.refresh(col)
    return {"id": str(col.id), "label": col.label}


@router.put("/custom-columns/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_custom_columns(
    body: DueCustomColumnReorderBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    for i, cid in enumerate(body.ordered_column_ids):
        await db.execute(update(DueCustomColumn).where(DueCustomColumn.id == cid).values(sort_order=i * 10))
    await db.commit()
    return None


@router.delete("/custom-columns/{column_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_column(
    column_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    await db.execute(sql_delete(DueCustomCell).where(DueCustomCell.column_id == column_id))
    r = await db.execute(select(DueCustomColumn).where(DueCustomColumn.id == column_id))
    col = r.scalars().first()
    if col:
        await db.delete(col)
    await db.commit()
    return None


@router.patch("/credit-notes/{credit_note_id}/phase-length", response_model=DueCreditNoteRow)
async def update_phase_length(
    credit_note_id: UUID,
    body: DuePhaseLengthBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    tr = await _ensure_tracking(db, credit_note_id)
    tr.phase_length_days = body.phase_length_days
    await db.commit()
    rows = await _build_rows(db, paid_only=tr.paid_at is not None)
    for r in rows:
        if r.id == credit_note_id:
            return r
    raise HTTPException(status_code=404, detail="Credit note not found")


@router.put("/credit-notes/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_credit_notes(
    body: DueReorderNotesBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    for i, cid in enumerate(body.ordered_credit_note_ids):
        tr = await _ensure_tracking(db, cid)
        tr.sort_order = i * 10
    await db.commit()
    return None


@router.post("/credit-notes/{credit_note_id}/mark-paid", status_code=status.HTTP_204_NO_CONTENT)
async def mark_paid(
    credit_note_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    tr = await _ensure_tracking(db, credit_note_id)
    tr.paid_at = datetime.now(timezone.utc)
    await db.commit()
    return None


@router.post("/credit-notes/{credit_note_id}/mark-unpaid", status_code=status.HTTP_204_NO_CONTENT)
async def mark_unpaid(
    credit_note_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    r = await db.execute(
        select(CreditNoteDueTracking).where(CreditNoteDueTracking.credit_note_id == credit_note_id),
    )
    tr = r.scalars().first()
    if tr:
        tr.paid_at = None
        await db.commit()
    return None


@router.patch("/credit-notes/{credit_note_id}/cell", status_code=status.HTTP_204_NO_CONTENT)
async def upsert_cell(
    credit_note_id: UUID,
    body: DueCellBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    r = await db.execute(select(DueCustomColumn).where(DueCustomColumn.id == body.column_id))
    if not r.scalars().first():
        raise HTTPException(status_code=404, detail="Unknown column")
    await _ensure_tracking(db, credit_note_id)
    r2 = await db.execute(
        select(DueCustomCell).where(
            DueCustomCell.credit_note_id == credit_note_id,
            DueCustomCell.column_id == body.column_id,
        ),
    )
    cell = r2.scalars().first()
    if cell:
        cell.value = body.value
    else:
        db.add(
            DueCustomCell(
                credit_note_id=credit_note_id,
                column_id=body.column_id,
                value=body.value,
            ),
        )
    await db.commit()
    return None


@router.post("/swap-cells", status_code=status.HTTP_204_NO_CONTENT)
async def swap_cells(
    body: DueSwapCellsBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    async def get_val(cn_id: UUID, col_id: UUID) -> str:
        r = await db.execute(
            select(DueCustomCell).where(
                DueCustomCell.credit_note_id == cn_id,
                DueCustomCell.column_id == col_id,
            ),
        )
        c = r.scalars().first()
        return c.value if c else ""

    va = await get_val(body.credit_note_id_a, body.column_id_a)
    vb = await get_val(body.credit_note_id_b, body.column_id_b)

    async def set_val(cn_id: UUID, col_id: UUID, val: str) -> None:
        await _ensure_tracking(db, cn_id)
        r = await db.execute(
            select(DueCustomCell).where(
                DueCustomCell.credit_note_id == cn_id,
                DueCustomCell.column_id == col_id,
            ),
        )
        cell = r.scalars().first()
        if cell:
            cell.value = val
        else:
            db.add(DueCustomCell(credit_note_id=cn_id, column_id=col_id, value=val))

    await set_val(body.credit_note_id_a, body.column_id_a, vb)
    await set_val(body.credit_note_id_b, body.column_id_b, va)
    await db.commit()
    return None


@router.post("/swap-rows", status_code=status.HTTP_204_NO_CONTENT)
async def swap_row_order(
    body: DueSwapRowsBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    ta = await _ensure_tracking(db, body.credit_note_id_a)
    tb = await _ensure_tracking(db, body.credit_note_id_b)
    ta.sort_order, tb.sort_order = tb.sort_order, ta.sort_order
    await db.commit()
    return None


@router.post("/swap-rows-custom-data", status_code=status.HTTP_204_NO_CONTENT)
async def swap_all_custom_cells_between_rows(
    body: DueSwapRowsBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    """Interchange every custom-column value between two credit notes (block swap across rows)."""
    if body.credit_note_id_a == body.credit_note_id_b:
        return None
    await _ensure_tracking(db, body.credit_note_id_a)
    await _ensure_tracking(db, body.credit_note_id_b)

    async def read_val(cn_id: UUID, col_id: UUID) -> str:
        r = await db.execute(
            select(DueCustomCell).where(
                DueCustomCell.credit_note_id == cn_id,
                DueCustomCell.column_id == col_id,
            ),
        )
        c = r.scalars().first()
        return (c.value if c else "") or ""

    col_ids = (await db.execute(select(DueCustomColumn.id))).scalars().all()
    for col_id in col_ids:
        va = await read_val(body.credit_note_id_a, col_id)
        vb = await read_val(body.credit_note_id_b, col_id)
        await db.execute(
            sql_delete(DueCustomCell).where(
                DueCustomCell.credit_note_id == body.credit_note_id_a,
                DueCustomCell.column_id == col_id,
            ),
        )
        await db.execute(
            sql_delete(DueCustomCell).where(
                DueCustomCell.credit_note_id == body.credit_note_id_b,
                DueCustomCell.column_id == col_id,
            ),
        )
        if vb:
            db.add(
                DueCustomCell(
                    credit_note_id=body.credit_note_id_a,
                    column_id=col_id,
                    value=vb,
                ),
            )
        if va:
            db.add(
                DueCustomCell(
                    credit_note_id=body.credit_note_id_b,
                    column_id=col_id,
                    value=va,
                ),
            )
    await db.commit()
    return None


def _fmt_money(n: float) -> str:
    return f"{n:.2f}"


@router.get("/report.csv")
async def due_account_report_csv(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    """
    Backward-compatible Due report endpoint.

    Returns the new workbook-based Due report (unpaid + paid aging rows) so old frontend
    builds that still call /due/report.csv also get the new report format.
    """
    return await aging_workbook_csv(db=db, current_user=current_user)


@router.get("/credit-notes-report.csv")
async def due_credit_notes_legacy_report_csv(
    date_from: date = Query(..., description="Start date (inclusive)"),
    date_to: date = Query(..., description="End date (inclusive)"),
    basis: Literal["delivery", "approved"] = Query(
        "delivery",
        description="Filter rows by credit note delivery date or approval timestamp date",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DUE)),
):
    """
    Legacy CSV export for approved B2B credit notes (kept for compatibility).
    """
    if date_from > date_to:
        raise HTTPException(status_code=400, detail="date_from must be on or before date_to")

    display_map = await _display_id_map(db)
    q = (
        select(CreditNote, CreditNoteApproval.approved_at, CreditNoteDueTracking)
        .join(CreditNoteApproval, CreditNoteApproval.credit_note_id == CreditNote.id)
        .outerjoin(CreditNoteDueTracking, CreditNoteDueTracking.credit_note_id == CreditNote.id)
        .where(
            CreditNote.status == TicketStatus.APPROVED,
            CreditNoteApproval.decision == Decision.APPROVED,
        )
    )
    if basis == "delivery":
        q = q.where(
            CreditNote.delivery_date >= date_from,
            CreditNote.delivery_date <= date_to,
        )
    else:
        q = q.where(
            cast(CreditNoteApproval.approved_at, SA_Date) >= date_from,
            cast(CreditNoteApproval.approved_at, SA_Date) <= date_to,
        )
    q = q.order_by(CreditNote.delivery_date.asc(), CreditNote.id.asc())
    result = await db.execute(q)
    raw = result.all()

    col_defs = (
        await db.execute(
            select(DueCustomColumn).order_by(DueCustomColumn.sort_order.asc(), DueCustomColumn.label.asc()),
        )
    ).scalars().all()

    note_ids = [cn.id for cn, _, _ in raw]
    cells_map = await _custom_cells_map(db, note_ids)

    buf = StringIO()
    writer = csv.writer(buf)

    headers = [
        "Due Account",
        "CN ID",
        "Particulars",
        "Market Area",
        "Delivery Date",
        "Phase Length (Days)",
        "Phase",
        "Timer Label",
        "Safe",
        "Warning",
        "Danger",
        "Doubtful",
        "Total",
        "Approved At",
        "Register Status",
        "Paid At",
    ]
    for c in col_defs:
        headers.append(c.label)
    writer.writerow(headers)

    for cn, approved_at, tr in raw:
        phase_length = tr.phase_length_days if tr else 15
        paid_at = tr.paid_at if tr else None
        phase, s, w, dg, dbf, label = compute_phase_and_buckets(
            approved_at,
            paid_at,
            phase_length,
            float(cn.amount),
        )
        did = display_map.get(cn.id, f"{CN_PREFIX}-???")
        market = (cn.market_area or "Calicut").strip() or "Calicut"
        reg_status = "Paid" if paid_at else "Open"
        paid_str = paid_at.replace(microsecond=0).isoformat() if paid_at else ""
        appr_str = approved_at.replace(microsecond=0).isoformat()

        row = [
            "Due desk",
            did,
            cn.customer_name,
            market,
            cn.delivery_date.isoformat(),
            str(phase_length),
            phase,
            label,
            _fmt_money(s),
            _fmt_money(w),
            _fmt_money(dg),
            _fmt_money(dbf),
            _fmt_money(float(cn.amount)),
            appr_str,
            reg_status,
            paid_str,
        ]
        cell_for = cells_map.get(cn.id, {})
        for c in col_defs:
            row.append(cell_for.get(str(c.id), ""))
        writer.writerow(row)

    data = buf.getvalue().encode("utf-8-sig")
    filename = f"due-credit-notes-report-{date_from.isoformat()}-to-{date_to.isoformat()}.csv"
    return StreamingResponse(
        BytesIO(data),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
