"""Admin routes: bundled under prefix `/admin` via main.include_router."""

import csv
import io
import zipfile
from datetime import date, datetime, timezone
from decimal import Decimal
from enum import Enum
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import require_roles
from ..database import get_db
from ..models import (
    Approval,
    B2CDailyEntry,
    CreditNote,
    CreditNoteApproval,
    CreditNoteDueTracking,
    CreditNoteTallyPending,
    DueAgingAdjustment,
    DueAgingMeta,
    DueAgingRow,
    DueAgingScan,
    DueCustomCell,
    DueCustomColumn,
    RejectionTicket,
    TallyPending,
    User,
    UserRole,
)

router = APIRouter(prefix="/admin", tags=["admin"])

_BACKUP_MODELS = [
    ("users", User, frozenset({"password_hash"})),
    ("rejection_tickets", RejectionTicket, frozenset()),
    ("approvals", Approval, frozenset()),
    ("tally_pending", TallyPending, frozenset()),
    ("credit_notes", CreditNote, frozenset()),
    ("credit_note_approvals", CreditNoteApproval, frozenset()),
    ("credit_note_tally_pending", CreditNoteTallyPending, frozenset()),
    ("b2c_daily_entries", B2CDailyEntry, frozenset()),
    ("credit_note_due_tracking", CreditNoteDueTracking, frozenset()),
    ("due_custom_columns", DueCustomColumn, frozenset()),
    ("due_custom_cells", DueCustomCell, frozenset()),
    ("due_aging_meta", DueAgingMeta, frozenset()),
    ("due_aging_scans", DueAgingScan, frozenset()),
    ("due_aging_rows", DueAgingRow, frozenset()),
    ("due_aging_adjustments", DueAgingAdjustment, frozenset()),
]


def _cell_str(val: object) -> str:
    if val is None:
        return ""
    if isinstance(val, bool):
        return "true" if val else "false"
    if isinstance(val, UUID):
        return str(val)
    if isinstance(val, Decimal):
        return format(val, "f")
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, Enum):
        return val.value if hasattr(val, "value") else val.name  # type: ignore[union-attr]
    return str(val)


async def _table_to_csv_utf8(session: AsyncSession, model, exclude_cols: frozenset[str]) -> bytes:
    col_keys = [c.key for c in model.__table__.columns if c.key not in exclude_cols]
    result = await session.execute(select(model))
    rows = result.scalars().all()
    buf = io.StringIO(newline="")
    writer = csv.writer(buf)
    writer.writerow(col_keys)
    for obj in rows:
        writer.writerow([_cell_str(getattr(obj, k, None)) for k in col_keys])
    return buf.getvalue().encode("utf-8")


_BACKUP_README = """PPF Rejection Portal — logical backup (CSV in ZIP)

What this contains
------------------
One CSV file per database table covering tickets, approvals, credit notes,
B2C daily entries, due aging, tally flags, etc.

users.csv excludes password hashes for security. You cannot restore passwords
from this ZIP alone — use Postgres pg_dump for a full snapshot, or recreate
accounts / reset passwords separately.

See the project file docs/SUPABASE_PG_DUMP.md for step-by-step pg_dump backup.
"""


@router.get("/export-backup.zip")
async def export_backup_zip(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    """Download a ZIP of UTF-8 CSV files (admin only)."""
    utc = datetime.now(timezone.utc)
    stamp = utc.strftime("%Y-%m-%d")
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("README.txt", _BACKUP_README)
        for filename, model, exclude in _BACKUP_MODELS:
            csv_bytes = await _table_to_csv_utf8(db, model, exclude)
            zf.writestr(f"{filename}.csv", csv_bytes)

    archive.seek(0)
    payload = archive.getvalue()
    return Response(
        content=payload,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="ppf-backup-{stamp}.zip"',
        },
    )
