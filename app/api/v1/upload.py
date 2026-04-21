import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from app.config import settings
from app.dependencies import get_current_user
from app.models.user import User

router = APIRouter(tags=["upload"])

ALLOWED_EXTENSIONS = {".txt", ".pdf", ".csv", ".json", ".xlsx", ".png", ".jpg", ".jpeg", ".zip"}


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="缺少文件名")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型: {ext}")

    content = await file.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail=f"文件超过 {settings.max_upload_size_mb}MB 限制")

    os.makedirs(settings.upload_dir, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(settings.upload_dir, filename)

    with open(filepath, "wb") as f:
        f.write(content)

    relative_url = f"/uploads/{filename}"
    download_url = f"{settings.site_url.rstrip('/')}{relative_url}"

    return {
        "filename": file.filename,
        "url": relative_url,
        "download_url": download_url,
        "size": len(content),
    }
