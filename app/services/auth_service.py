import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, UnauthorizedError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_api_key,
    get_key_prefix,
    hash_api_key,
    hash_password,
    verify_password,
)
from app.models.user import APIKey, User
from app.schemas.user import UserRegister


async def register_user(db: AsyncSession, data: UserRegister) -> User:
    stmt = select(User).where(User.email == data.email)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise UnauthorizedError("Email already registered")

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        display_name=data.display_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def login_user(db: AsyncSession, email: str, password: str) -> dict:
    stmt = select(User).where(User.email == email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.password_hash):
        raise UnauthorizedError("Invalid email or password")

    return {
        "access_token": create_access_token(str(user.id)),
        "refresh_token": create_refresh_token(str(user.id)),
        "token_type": "bearer",
    }


async def refresh_tokens(db: AsyncSession, refresh_token: str) -> dict:
    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise UnauthorizedError("Invalid token type")
    except Exception:
        raise UnauthorizedError("Invalid refresh token")

    user_id = payload["sub"]
    stmt = select(User).where(User.id == uuid.UUID(user_id))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise UnauthorizedError("User not found or inactive")

    return {
        "access_token": create_access_token(str(user.id)),
        "refresh_token": create_refresh_token(str(user.id)),
        "token_type": "bearer",
    }


async def create_api_key(
    db: AsyncSession, user_id: uuid.UUID, key_type: str, name: Optional[str] = None
) -> tuple:
    prefix = "ak" if key_type == "agent_key" else "sk"
    raw_key = generate_api_key(prefix)
    key_hash = hash_api_key(raw_key)
    key_prefix = get_key_prefix(raw_key)

    api_key = APIKey(
        user_id=user_id,
        key_type=key_type,
        key_hash=key_hash,
        key_prefix=key_prefix,
        name=name,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)
    return api_key, raw_key


async def validate_api_key(db: AsyncSession, raw_key: str) -> tuple:
    key_hash = hash_api_key(raw_key)
    stmt = select(APIKey).where(APIKey.key_hash == key_hash, APIKey.is_active == True)
    result = await db.execute(stmt)
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise UnauthorizedError("Invalid API key")

    api_key.last_used_at = datetime.now(timezone.utc)
    await db.commit()

    stmt = select(User).where(User.id == api_key.user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise UnauthorizedError("User not found or inactive")

    return user, api_key
