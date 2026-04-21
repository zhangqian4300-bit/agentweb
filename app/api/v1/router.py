from fastapi import APIRouter

from app.api.v1.agents import router as agents_router
from app.api.v1.api_keys import router as api_keys_router
from app.api.v1.auth import router as auth_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.invoke import router as invoke_router
from app.api.v1.usage import router as usage_router
from app.api.v1.users import router as users_router

router = APIRouter(prefix="/api/v1")
router.include_router(auth_router)
router.include_router(users_router)
router.include_router(api_keys_router)
router.include_router(agents_router)
router.include_router(invoke_router)
router.include_router(usage_router)
router.include_router(dashboard_router)
