from functools import lru_cache
from pydantic_settings import BaseSettings
from typing import List, Optional


class Settings(BaseSettings):
    app_name: str = "Rejection Management Ticket System"
    environment: str = "development"

    # Security
    jwt_secret_key: str = "CHANGE_ME_IN_PRODUCTION"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expires_minutes: int = 60 * 8

    # Database
    database_url: Optional[str] = None

    # Bootstrap Due desk account if missing (production DBs often never run /auth/seed-users).
    due_user_email: str = "due@ppf.local"
    due_user_password: str = "due123"

    # CORS
    backend_cors_origins: List[str] = ["http://localhost:5174", "http://localhost:5173"]

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    # Normalize Postgres URLs for SQLAlchemy asyncio.
    # Render/Supabase often provide "postgres://" or "postgresql://".
    # We need "postgresql+asyncpg://..." so SQLAlchemy doesn't try psycopg2.
    if settings.database_url:
        if settings.database_url.startswith("postgres://"):
            settings.database_url = "postgresql+asyncpg://" + settings.database_url[len("postgres://") :]
        elif settings.database_url.startswith("postgresql://") and "+asyncpg" not in settings.database_url:
            settings.database_url = "postgresql+asyncpg://" + settings.database_url[len("postgresql://") :]

    # Fallback to local SQLite for easy localhost development.
    # Production should always set DATABASE_URL explicitly.
    if not settings.database_url:
        settings.database_url = "sqlite+aiosqlite:///rejections_dev.db"
    return settings

