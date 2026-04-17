from fastapi import FastAPI, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi import HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .routers import auth, tickets, approvals, admin, tally, credit_notes, credit_note_approvals, credit_note_tally, due, due_aging
from .database import engine, Base, get_db, AsyncSessionLocal
from .models import (
    User,
    UserRole,
    Approval,
    RejectionTicket,
    TallyPending,
    CreditNote,
    CreditNoteApproval,
    CreditNoteTallyPending,
    DueCustomCell,
    DueCustomColumn,
    CreditNoteDueTracking,
    DueAgingMeta,
    DueAgingScan,
    DueAgingAdjustment,
    DueAgingRow,
)
from .auth.deps import require_roles


settings = get_settings()

app = FastAPI(title=settings.app_name)

# CORS: allow dev frontend origins so browser never blocks on 4xx/5xx
CORS_ORIGINS = ["https://ppf-rejection-portal.onrender.com"]


def _add_cors_headers(response, request: Request):
    origin = request.headers.get("origin")
    if origin and origin in CORS_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
    else:
        response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, Accept"
    return response


class AddCORSHeadersMiddleware(BaseHTTPMiddleware):
    """Ensure CORS headers on every response (4xx, 5xx, and success)."""
    async def dispatch(self, request: Request, call_next):
        try:
            response = await call_next(request)
            return _add_cors_headers(response, request)
        except HTTPException as e:
            resp = JSONResponse(
                status_code=e.status_code,
                content={"detail": e.detail} if isinstance(e.detail, str) else {"detail": e.detail},
            )
            return _add_cors_headers(resp, request)
        except Exception as e:
            # 500 or any unhandled exception: still send CORS so the browser shows the error
            import traceback
            traceback.print_exc()
            resp = JSONResponse(
                status_code=500,
                content={"detail": "Internal server error"},
            )
            return _add_cors_headers(resp, request)


app.add_middleware(AddCORSHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    # Auto-create tables for local development. In production, prefer Alembic migrations.
    async with engine.connect() as conn:
        # Run each DDL in its own transaction. On Postgres, any failed statement aborts the
        # whole transaction; isolating avoids breaking startup when a no-op migration fails.
        for stmt in (
            "ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'TALLY'",
            # SQLAlchemy persists enum member names (DUE, TALLY), not .value strings.
            "ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'DUE'",
            "ALTER TABLE rejection_tickets ADD COLUMN IF NOT EXISTS uom VARCHAR(16) NOT NULL DEFAULT 'EA'",
            "ALTER TABLE rejection_tickets ALTER COLUMN quantity TYPE NUMERIC(14,3) USING quantity::numeric",
            "ALTER TABLE tally_pending ADD COLUMN IF NOT EXISTS posted_at TIMESTAMP WITH TIME ZONE",
        ):
            try:
                async with conn.begin():
                    await conn.execute(text(stmt))
            except Exception:
                # If not Postgres or object doesn't exist yet, ignore.
                pass

        async with conn.begin():
            await conn.run_sync(Base.metadata.create_all)

        dialect = conn.engine.dialect.name
        cn_alters: list[str] = []
        if dialect == "sqlite":
            cn_alters = [
                "ALTER TABLE credit_notes ADD COLUMN market_area VARCHAR(128) DEFAULT 'Calicut'",
                "ALTER TABLE credit_notes ADD COLUMN amount_safe REAL DEFAULT 0",
                "ALTER TABLE credit_notes ADD COLUMN amount_warning REAL DEFAULT 0",
                "ALTER TABLE credit_notes ADD COLUMN amount_danger REAL DEFAULT 0",
                "ALTER TABLE credit_notes ADD COLUMN amount_doubtful REAL DEFAULT 0",
                "ALTER TABLE credit_notes ADD COLUMN remarks TEXT",
            ]
        elif dialect == "postgresql":
            cn_alters = [
                "ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS market_area VARCHAR(128) DEFAULT 'Calicut'",
                "ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS amount_safe NUMERIC(12,2) DEFAULT 0 NOT NULL",
                "ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS amount_warning NUMERIC(12,2) DEFAULT 0 NOT NULL",
                "ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS amount_danger NUMERIC(12,2) DEFAULT 0 NOT NULL",
                "ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS amount_doubtful NUMERIC(12,2) DEFAULT 0 NOT NULL",
                "ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS remarks TEXT",
            ]
        for stmt in cn_alters:
            try:
                async with conn.begin():
                    await conn.execute(text(stmt))
            except Exception:
                pass

        due_aging_alters: list[str] = []
        if dialect == "sqlite":
            due_aging_alters = [
                "ALTER TABLE due_aging_rows ADD COLUMN source_excel_row INTEGER",
                "ALTER TABLE due_aging_rows ADD COLUMN source_particulars_col VARCHAR(8)",
                "ALTER TABLE due_aging_rows ADD COLUMN scan_id VARCHAR(36)",
            ]
        elif dialect == "postgresql":
            due_aging_alters = [
                "ALTER TABLE due_aging_rows ADD COLUMN IF NOT EXISTS source_excel_row INTEGER",
                "ALTER TABLE due_aging_rows ADD COLUMN IF NOT EXISTS source_particulars_col VARCHAR(8)",
                "ALTER TABLE due_aging_rows ADD COLUMN IF NOT EXISTS scan_id UUID",
            ]
        for stmt in due_aging_alters:
            try:
                async with conn.begin():
                    await conn.execute(text(stmt))
            except Exception:
                pass

    await _backfill_due_aging_scans_if_needed()
    await _ensure_due_user_bootstrap()

    print("PPF Backend started. POST /tickets (create) is allowed for any authenticated user.")


async def _backfill_due_aging_scans_if_needed() -> None:
    """If rows exist but no scan records yet, create Scan 1 and attach all rows (one-time migration)."""
    try:
        async with AsyncSessionLocal() as session:
            n_scans = (
                await session.execute(select(func.count()).select_from(DueAgingScan))
            ).scalar_one()
            n_rows = (
                await session.execute(select(func.count()).select_from(DueAgingRow))
            ).scalar_one()
            if (n_scans or 0) > 0 or not n_rows:
                return
            m = (
                await session.execute(select(DueAgingMeta).order_by(DueAgingMeta.updated_at.desc()).limit(1))
            ).scalars().first()
            bo = (
                m.bucket_order_json
                if m and m.bucket_order_json
                else '["safe","warning","danger","doubtful"]'
            )
            scan = DueAgingScan(
                scan_number=1,
                company_title=(m.company_title if m else "") or "",
                date_range_label=(m.date_range_label if m else "") or "",
                bucket_order_json=bo,
                source_filename=None,
            )
            session.add(scan)
            await session.flush()
            await session.execute(update(DueAgingRow).values(scan_id=scan.id))
            await session.commit()
            print("PPF: due aging — created Scan 1 and linked existing rows.")
    except Exception as e:
        print(f"PPF: due aging scan backfill skipped or failed: {e}")


async def _ensure_due_user_bootstrap() -> None:
    """Create Due desk user on first deploy / empty DB so login works without calling /auth/seed-users."""
    from passlib.context import CryptContext

    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    email = settings.due_user_email.strip().lower()
    password = settings.due_user_password
    if not email or not password:
        return
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(User).where(User.email == email))
            if result.scalars().first():
                return
            session.add(
                User(
                    name="Due Desk",
                    email=email,
                    password_hash=pwd_context.hash(password),
                    role=UserRole.DUE,
                ),
            )
            await session.commit()
            print(f"PPF: created bootstrap user {email} (Due desk).")
    except Exception as e:
        print(f"PPF: could not bootstrap Due user ({email}): {e}")


app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/", include_in_schema=False)
async def index():
    return FileResponse("index.html")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/admin/reset-db", status_code=status.HTTP_200_OK)
async def reset_database(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
):
    """Delete all tickets, credit notes, approvals, and tally marks. Users are kept. Admin only."""
    await db.execute(delete(CreditNoteTallyPending))
    await db.execute(delete(DueCustomCell))
    await db.execute(delete(CreditNoteDueTracking))
    await db.execute(delete(DueAgingAdjustment))
    await db.execute(delete(DueAgingRow))
    await db.execute(delete(DueAgingScan))
    await db.execute(delete(DueAgingMeta))
    await db.execute(delete(DueCustomColumn))
    await db.execute(delete(CreditNoteApproval))
    await db.execute(delete(CreditNote))
    await db.execute(delete(TallyPending))
    await db.execute(delete(Approval))
    await db.execute(delete(RejectionTicket))
    await db.commit()
    return {"status": "ok", "message": "All tickets, credit notes, and approvals have been deleted."}


app.include_router(auth.router)
app.include_router(tickets.router)
app.include_router(approvals.router)
app.include_router(tally.router)
app.include_router(credit_notes.router)
app.include_router(credit_note_approvals.router)
app.include_router(credit_note_tally.router)
app.include_router(due.router)
app.include_router(due_aging.router)
app.include_router(admin.router)

