"""Persistent two-file asset images: compressed source + lossless display."""
import io
import re
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener
register_heif_opener(thumbnails=False)

from sqlalchemy.orm import Session
from . import models
from .db import DATA_DIR, get_db

router = APIRouter(prefix="/api/images", tags=["images"])
MEDIA_DIR = DATA_DIR / "media"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
MAX_BYTES = 20 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 20_000_000


@router.post("", status_code=201)
async def upload_image(request: Request):
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_BYTES:
            raise HTTPException(413, "图片不能超过 20 MB")
    try:
        with Image.open(io.BytesIO(data)) as source:
            if source.width * source.height > 20_000_000:
                raise HTTPException(413, "图片不能超过 2000 万像素")
            source.load()
            display = ImageOps.exif_transpose(source).convert("RGBA" if "A" in source.getbands() or "transparency" in source.info else "RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, ValueError):
        raise HTTPException(422, "无法读取图片，请使用 JPEG、PNG、WebP 或 HEIC 格式")

    image_id = uuid.uuid4().hex
    folder = MEDIA_DIR / image_id
    folder.mkdir()
    try:
        # Display retains full decoded resolution and is encoded losslessly.
        display.save(folder / "display.png", format="PNG", compress_level=0)
        original = display.copy()
        original.thumbnail((2400, 2400), Image.Resampling.LANCZOS)
        if original.mode == "RGBA":
            original.save(folder / "original.png", format="PNG", optimize=True)
        else:
            original.save(folder / "original.jpg", format="JPEG", quality=88, optimize=True)
    except Exception:
        shutil.rmtree(folder, ignore_errors=True)
        raise
    return {"image_url": f"/media/{image_id}/display.png", "original_url": f"/api/images/{image_id}/original"}


@router.get("/{image_id}/original")
def download_original(image_id: str):
    if len(image_id) != 32 or any(c not in "0123456789abcdef" for c in image_id):
        raise HTTPException(404, "图片不存在")
    for extension in ("jpg", "png", "heic"):
        file = MEDIA_DIR / image_id / f"original.{extension}"
        if file.is_file():
            return FileResponse(file, filename=f"keeps-original-{image_id[:8]}.{extension}")
    raise HTTPException(404, "原图不存在")


def remove_unreferenced_image(image_url: str, db: Session) -> bool:
    match = re.fullmatch(r"/media/([a-f0-9]{32})/display\.png", image_url or "")
    if not match or db.query(models.Asset.id).filter(models.Asset.image_url == image_url).first():
        return False
    shutil.rmtree(MEDIA_DIR / match.group(1), ignore_errors=True)
    return True


@router.delete("/{image_id}", status_code=204)
def delete_unused_image(image_id: str, db: Session = Depends(get_db)):
    if not re.fullmatch(r"[a-f0-9]{32}", image_id):
        raise HTTPException(404, "图片不存在")
    if not remove_unreferenced_image(f"/media/{image_id}/display.png", db):
        raise HTTPException(409, "此图片仍被资产使用")
