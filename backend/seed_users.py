import asyncio

from passlib.context import CryptContext

from app.database import AsyncSessionLocal, engine, Base
from app.models import User, UserRole

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def main():
  # Ensure tables exist
  async with engine.begin() as conn:
    await conn.run_sync(Base.metadata.create_all)

  async with AsyncSessionLocal() as session:
    # Helper to upsert a user by email
    async def ensure_user(name: str, email: str, password: str, role: UserRole):
      from sqlalchemy import select

      result = await session.execute(select(User).where(User.email == email))
      existing = result.scalars().first()
      if existing:
        return
      user = User(
        name=name,
        email=email,
        password_hash=pwd_context.hash(password),
        role=role,
      )
      session.add(user)
      await session.commit()

    await ensure_user("B2B Exec", "b2b@ppf.local", "b2b123", UserRole.B2B)
    await ensure_user("B2C Exec", "b2c@ppf.local", "b2c123", UserRole.B2C)
    await ensure_user("Manager", "manager@ppf.local", "manager123", UserRole.MANAGER)
    await ensure_user("Admin", "admin@ppf.local", "admin123", UserRole.ADMIN)
    await ensure_user("Tally Dept", "tally@ppf.local", "tally123", UserRole.TALLY)


if __name__ == "__main__":
  asyncio.run(main())

