from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User
from ..schemas import Token, UserRead
from ..auth.jwt import create_access_token
from ..auth.deps import get_current_user


router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalars().first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    access_token = create_access_token(user_id=user.id, role=user.role)
    return Token(access_token=access_token)


@router.get("/me", response_model=UserRead)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


class ChangePasswordBody(BaseModel):
    old_password: str
    new_password: str


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: ChangePasswordBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Allow the logged-in user to change their password."""
    if not verify_password(body.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    if len(body.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters long",
        )

    current_user.password_hash = hash_password(body.new_password)
    db.add(current_user)
    await db.commit()
    return None


@router.get("/seed-users")
async def seed_users(db: AsyncSession = Depends(get_db)):
    from passlib.context import CryptContext
    from ..models import User, UserRole
    from ..database import engine, Base
    from sqlalchemy import select

    # ensure tables exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    users = [
        ("B2B Exec", "b2b@ppf.local", "b2b123", UserRole.B2B),
        ("B2C Exec", "b2c@ppf.local", "b2c123", UserRole.B2C),
        ("Manager", "manager@ppf.local", "manager123", UserRole.MANAGER),
        ("Admin", "admin@ppf.local", "admin123", UserRole.ADMIN),
        ("Tally Dept", "tally@ppf.local", "tally123", UserRole.TALLY),
    ]

    created = 0
    skipped = 0
    for name, email, password, role in users:
        result = await db.execute(select(User).where(User.email == email))
        existing = result.scalars().first()
        if existing:
            skipped += 1
            continue
        user = User(
            name=name,
            email=email,
            password_hash=pwd_context.hash(password),
            role=role
        )
        db.add(user)
        created += 1

    await db.commit()

    return {"status": "ok", "created": created, "skipped": skipped}
