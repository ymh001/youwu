"""Recycle bin retention is shared by all clients of this database."""
from datetime import datetime, timedelta
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from . import models, crud
from .db import SessionLocal, get_db
from .media import remove_unreferenced_image

router = APIRouter(prefix="/api/trash", tags=["trash"])
KEY = "trash_retention_days"


class RetentionIn(BaseModel):
    retention_days: Optional[Literal[7, 30, 180]]


def retention_days(db: Session):
    row = db.get(models.AppSetting, KEY)
    if not row:
        return 180
    return None if row.value == "never" else int(row.value)


def erase_records(db: Session, records):
    urls = {record.image_url for record in records if record.image_url}
    count = len(records)
    from .attachments import ROOT
    attachment_paths = []
    for record in records:
        for child in db.query(models.Asset).filter_by(parent_id=record.id).all():
            child.parent_id = None
            child.show_on_home = True
        for attachment in db.query(models.Attachment).filter_by(asset_id=record.id).all():
            attachment_paths.append(ROOT / attachment.id)
            db.delete(attachment)
        db.delete(record)
    db.commit()
    for path in attachment_paths:
        path.unlink(missing_ok=True)
    for url in urls:
        remove_unreferenced_image(url, db)
    return count


def purge_expired(db: Session, now=None):
    days = retention_days(db)
    if days is None:
        return 0
    cutoff = (now or datetime.utcnow()) - timedelta(days=days)
    records = db.query(models.Asset).filter(models.Asset.deleted_at.isnot(None), models.Asset.deleted_at <= cutoff).all()
    return erase_records(db, records) if records else 0


def sweep_expired():
    with SessionLocal() as db:
        purge_expired(db)


def deleted_asset(db, asset_id):
    asset = db.get(models.Asset, asset_id)
    if not asset or asset.deleted_at is None:
        raise HTTPException(404, "回收站中没有此记录")
    return asset


@router.get("")
def list_trash(db: Session = Depends(get_db)):
    purge_expired(db)
    assets = db.query(models.Asset).filter(models.Asset.deleted_at.isnot(None)).order_by(models.Asset.deleted_at.desc()).all()
    return {"retention_days": retention_days(db), "items": [{**crud.serialize_asset(a), "deleted_at": a.deleted_at.isoformat() + "Z"} for a in assets]}


@router.patch("/settings")
def update_retention(payload: RetentionIn, db: Session = Depends(get_db)):
    row = db.get(models.AppSetting, KEY)
    if row is None:
        row = models.AppSetting(key=KEY)
        db.add(row)
    row.value = "never" if payload.retention_days is None else str(payload.retention_days)
    db.commit()
    removed = purge_expired(db)
    return {"retention_days": payload.retention_days, "removed": removed}


@router.post("/{asset_id}/restore")
def restore(asset_id: str, db: Session = Depends(get_db)):
    purge_expired(db)
    asset = deleted_asset(db, asset_id)
    asset.deleted_at = None
    db.commit()
    crud.ensure_today_snapshot(db)
    return crud.serialize_asset(asset)


@router.delete("/{asset_id}", status_code=204)
def delete_permanently(asset_id: str, db: Session = Depends(get_db)):
    erase_records(db, [deleted_asset(db, asset_id)])


@router.delete("", status_code=204)
def empty_trash(db: Session = Depends(get_db)):
    erase_records(db, db.query(models.Asset).filter(models.Asset.deleted_at.isnot(None)).all())
