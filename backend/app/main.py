from fastapi import FastAPI, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi import HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .routers import auth, tickets, approvals, admin, tally
from .database import engine, Base, get_db
from .models import User, UserRole, Approval, RejectionTicket, TallyPending
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
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("PPF Backend started. POST /tickets (create) is allowed for any authenticated user.")


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
    """Delete all tickets, approvals, and tally marks. Users are kept. Admin only."""
    await db.execute(delete(TallyPending))
    await db.execute(delete(Approval))
    await db.execute(delete(RejectionTicket))
    await db.commit()
    return {"status": "ok", "message": "All tickets and approvals have been deleted."}


app.include_router(auth.router)
app.include_router(tickets.router)
app.include_router(approvals.router)
app.include_router(tally.router)
app.include_router(admin.router)

