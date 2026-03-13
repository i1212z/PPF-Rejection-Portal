from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from passlib.context import CryptContext
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


@router.get("/seed-users")
async def seed_users(db: AsyncSession = Depends(get_db)):
    from passlib.context import CryptContext
    from ..models import User, UserRole
    from ..database import engine, Base

    # ensure tables exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    users = [
        ("B2B Exec", "b2b@ppf.local", "b2b123", UserRole.B2B),
        ("B2C Exec", "b2c@ppf.local", "b2c123", UserRole.B2C),
        ("Manager", "manager@ppf.local", "manager123", UserRole.MANAGER),
        ("Admin", "admin@ppf.local", "admin123", UserRole.ADMIN),
    ]

    for name, email, password, role in users:
        user = User(
            name=name,
            email=email,
            password_hash=pwd_context.hash(password),
            role=role
        )
        db.add(user)

    await db.commit()

    return {"status": "users created"}
