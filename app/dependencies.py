import uuid

from fastapi import Depends, Header
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import UnauthorizedError
from app.core.security import decode_token
from app.models.user import User
from app.services.auth_service import validate_api_key

from sqlalchemy import select


async def get_current_user(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not authorization.startswith("Bearer "):
        raise UnauthorizedError("Invalid authorization header")

    token = authorization[7:]
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise UnauthorizedError("Invalid token type")
        user_id = payload["sub"]
    except JWTError:
        raise UnauthorizedError("Invalid token")

    stmt = select(User).where(User.id == uuid.UUID(user_id))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise UnauthorizedError("User not found or inactive")
    return user


async def get_api_key_user(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> tuple:
    if not authorization.startswith("Bearer "):
        raise UnauthorizedError("Invalid authorization header")

    raw_key = authorization[7:]
    return await validate_api_key(db, raw_key)


async def get_agent_key_user(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> tuple:
    if not authorization.startswith("Bearer "):
        raise UnauthorizedError("Invalid authorization header")

    raw_key = authorization[7:]
    user, api_key = await validate_api_key(db, raw_key)
    if api_key.key_type != "agent_key":
        raise UnauthorizedError("This endpoint requires an agent_key")
    return user, api_key
