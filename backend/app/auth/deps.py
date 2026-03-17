from typing import List

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models import User, UserRole, Channel
from ..schemas import TokenData
from .jwt import decode_access_token


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token_data: TokenData = decode_access_token(token)
    except JWTError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == token_data.user_id))
    user = result.scalars().first()
    if user is None:
        raise credentials_exception
    return user


def get_current_user_for_ticket_create(
    user: User = Depends(get_current_user),
) -> User:
    """Use for POST /tickets only. Any authenticated user can create (no 403 by role)."""
    return user


def require_roles(*roles: UserRole):
    async def _require_roles(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
        return user

    return _require_roles


def get_channel_filter_for_user(user: User) -> Channel | None:
    if user.role == UserRole.B2B:
        return Channel.B2B
    if user.role == UserRole.B2C:
        return Channel.B2C
    return None

