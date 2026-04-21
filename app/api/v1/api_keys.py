import uuid
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.core.security import decrypt_api_key
from app.dependencies import get_current_user
from app.models.user import APIKey, User
from app.schemas.user import APIKeyCreate, APIKeyCreatedResponse, APIKeyResponse, APIKeyRevealResponse
from app.services.auth_service import create_api_key

router = APIRouter(prefix="/keys", tags=["api-keys"])


@router.post("", response_model=APIKeyCreatedResponse)
async def create_key(
    data: APIKeyCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    api_key, raw_key = await create_api_key(db, user.id, data.key_type, data.name)
    return APIKeyCreatedResponse(
        id=api_key.id,
        key_type=api_key.key_type,
        key_prefix=api_key.key_prefix,
        name=api_key.name,
        is_active=api_key.is_active,
        last_used_at=api_key.last_used_at,
        created_at=api_key.created_at,
        key=raw_key,
    )


@router.get("", response_model=List[APIKeyResponse])
async def list_keys(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(APIKey).where(APIKey.user_id == user.id, APIKey.is_active == True)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/default", response_model=APIKeyRevealResponse)
async def get_default_key(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(APIKey).where(
        APIKey.user_id == user.id,
        APIKey.key_type == "api_key",
        APIKey.is_active == True,
        APIKey.encrypted_key.isnot(None),
    ).order_by(APIKey.created_at.asc()).limit(1)
    result = await db.execute(stmt)
    api_key = result.scalar_one_or_none()

    if api_key:
        return APIKeyRevealResponse(key=decrypt_api_key(api_key.encrypted_key))

    _, raw_key = await create_api_key(db, user.id, "api_key", "default")
    return APIKeyRevealResponse(key=raw_key)


@router.get("/{key_id}/reveal", response_model=APIKeyRevealResponse)
async def reveal_key(
    key_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(APIKey).where(APIKey.id == key_id, APIKey.user_id == user.id)
    result = await db.execute(stmt)
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise NotFoundError("API key not found")
    if not api_key.encrypted_key:
        return APIKeyRevealResponse(key=f"{api_key.key_prefix}...")
    return APIKeyRevealResponse(key=decrypt_api_key(api_key.encrypted_key))


@router.delete("/{key_id}")
async def revoke_key(
    key_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(APIKey).where(APIKey.id == key_id, APIKey.user_id == user.id)
    result = await db.execute(stmt)
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise NotFoundError("API key not found")
    api_key.is_active = False
    await db.commit()
    return {"detail": "Key revoked"}
