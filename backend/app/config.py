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

    # CORS
    backend_cors_origins: List[str] = ["http://localhost:5174", "http://localhost:5173"]

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    # Fallback to local sqlite for easy localhost development
    if not settings.database_url:
        settings.database_url = "postgresql://ppf_rejection_db_user:yaaPJ10LWPeOYHhPYRghsIEYVgyKGZhI@dpg-d6plfan5gffc73dme5qg-a/ppf_rejection_db"
    return settings

