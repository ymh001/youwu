import os
import asyncio
import math
from contextlib import suppress
from datetime import date, datetime
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import or_
from sqlalchemy.orm import Session

from . import auth, crud, models, schemas
from .targets import validate_target
from .db import Base, engine, get_db, migrate_schema
from .media import MEDIA_DIR, remove_unreferenced_image, router as media_router

from .trash import router as trash_router, sweep_expired
from .attachments import router as attachment_router
from .backup import router as backup_router
from .webdav import router as webdav_router

app = FastAPI(title="有物 API", version="0.2.0")

app.include_router(media_router)
app.include_router(attachment_router)
app.include_router(backup_router)
app.include_router(webdav_router)
app.include_router(trash_router)
app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")

app.middleware("http")(auth.guard)
app.include_router(auth.router)

@app.on_event("startup")
def on_startup() -> None:
    auth.initialize()
    Base.metadata.create_all(bind=engine)
    migrate_schema()
    sweep_expired()
    from .seed import seed_if_empty

    if os.environ.get("SEED_DEMO", "0") != "0":
        seed_if_empty()


@app.on_event("startup")
async def start_trash_sweeper():
    async def sweep_loop():
        while True:
            await asyncio.sleep(3600)
            try:
                await asyncio.to_thread(sweep_expired)
            except Exception:
                import logging
                logging.getLogger(__name__).exception("Recycle bin cleanup failed")
    app.state.trash_sweeper = asyncio.create_task(sweep_loop())


@app.on_event("shutdown")
async def stop_trash_sweeper():
    task = getattr(app.state, "trash_sweeper", None)
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


# ---------------------------------------------------------------- assets


def _apply_payload(asset: models.Asset, payload: dict, db: Session) -> None:
    if asset.type == 'wish' and payload.get('type') == 'asset':
        purchased = crud.parse_date(payload.get('purchase_date'))
        if not purchased or purchased > date.today():
            raise HTTPException(422, '心愿转为资产时，请填写实际购买日期，不能晚于今天')
    target_fields = ('target_mode', 'target_daily', 'target_date', 'target_quantity', 'target_unit', 'target_step', 'target_completed')
    effective = {k: payload.get(k, getattr(asset, k, None)) for k in (*target_fields, 'purchase_date')}
    validate_target(effective)
    for key in target_fields:
        if key in payload: setattr(asset, key, payload[key])
    for field in (
        "name",
        "price",
        "type",
        "status",
        "icon",
        "image_url",
        "notes",
        "show_on_home",
        "include_in_parent",
        "cost_rule",
        "used_count",
        "custom_daily",
        "target_daily",
        "is_pinned",
        "exclude_total",
        "exclude_daily",
        "sold_price",
    ):
        if field in payload and payload[field] is not None:
            setattr(asset, field, payload[field])
    for field in ("purchase_date", "sold_date", "retired_date", "wish_date"):
        if field in payload:
            setattr(asset, field, crud.parse_date(payload[field]))

    if asset.type == "wish" and asset.id and db.query(models.Asset).filter_by(parent_id=asset.id).first():
        raise HTTPException(422, "请先解除附属关系，再将主资产转为心愿")
    if "parent_id" in payload:
        parent_id = payload["parent_id"] or None
        visited = {asset.id} if asset.id else set()
        current = parent_id
        while current:
            if current in visited:
                raise HTTPException(422, "附属关系不能形成循环")
            visited.add(current)
            parent = db.get(models.Asset, current)
            if not parent or parent.deleted_at or parent.type != "asset":
                raise HTTPException(422, "请选择存在的正常资产作为主物品")
            current = parent.parent_id
        if parent_id and asset.type != "asset":
            raise HTTPException(422, "心愿不能作为附属物品")
        asset.parent_id = parent_id
    if "attachment_ids" in payload:
        if not asset.id:
            asset.id = models.new_id()
        ids = set(payload["attachment_ids"] or [])
        files = db.query(models.Attachment).filter(models.Attachment.id.in_(ids)).all()
        if len(files) != len(ids) or any(f.is_archive or f.asset_id not in (None, asset.id) for f in files):
            raise HTTPException(422, "附件不存在或属于另一件资产")
        for previous in db.query(models.Attachment).filter_by(asset_id=asset.id).all():
            if previous.id not in ids:
                previous.asset_id = None
        for file in files:
            file.asset_id = asset.id

    if "category_id" in payload:
        cid = payload.get("category_id")
        asset.category_id = cid if cid and db.get(models.Category, cid) else None

    if "tag_ids" in payload and payload["tag_ids"] is not None:
        tags = db.query(models.Tag).filter(models.Tag.id.in_(payload["tag_ids"])).all()
        asset.tags = tags


@app.get("/api/health")
def health():
    return {"ok": True, "time": datetime.utcnow().isoformat()}


@app.get("/api/assets", response_model=List[schemas.AssetOut])
def list_assets(
    type: str = Query("asset", pattern="^(asset|wish|all)$"),
    status: Optional[str] = None,
    category_id: Optional[str] = None,
    tag_id: Optional[str] = None,
    q: Optional[str] = None,
    sort: str = "created_desc",
    db: Session = Depends(get_db),
):
    query = db.query(models.Asset).filter(models.Asset.deleted_at.is_(None))
    if type != "all":
        query = query.filter(models.Asset.type == type)
    if status and status != "all":
        query = query.filter(models.Asset.status == status)
    if category_id:
        query = query.filter(models.Asset.category_id == category_id)
    if tag_id:
        query = query.join(models.Asset.tags).filter(models.Tag.id == tag_id)
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(models.Asset.name.ilike(like), models.Asset.notes.ilike(like))
        )

    order = {
        "created_desc": models.Asset.created_at.desc(),
        "created_asc": models.Asset.created_at.asc(),
        "purchase_desc": models.Asset.purchase_date.desc(),
        "purchase_asc": models.Asset.purchase_date.asc(),
        "price_desc": models.Asset.price.desc(),
        "price_asc": models.Asset.price.asc(),
    }.get(sort)

    assets = query.all()
    if order is not None:
        assets.sort(key=lambda a: (a.is_pinned or False), reverse=True)
        # apply SQL-ish ordering in python to keep pinned first
        if sort == "created_desc":
            assets.sort(key=lambda a: (a.is_pinned or False, a.created_at or datetime.min), reverse=True)
        elif sort == "created_asc":
            assets.sort(key=lambda a: (a.is_pinned or False, a.created_at or datetime.min))
        elif sort == "purchase_desc":
            assets.sort(key=lambda a: (a.is_pinned or False, a.purchase_date or date.min), reverse=True)
        elif sort == "purchase_asc":
            assets.sort(key=lambda a: (a.is_pinned or False, a.purchase_date or date.min))
        elif sort == "price_desc":
            assets.sort(key=lambda a: (a.is_pinned or False, a.price or 0), reverse=True)
        elif sort == "price_asc":
            assets.sort(key=lambda a: (a.is_pinned or False, a.price or 0))
    else:
        assets.sort(key=lambda a: (a.is_pinned or False), reverse=True)

    if type == 'wish' and sort == 'created_desc':
        assets.sort(key=lambda a: (a.sort or 0))
    out = [crud.serialize_asset(a) for a in assets]
    if sort == "daily_desc":
        out.sort(key=lambda x: x["daily_cost"], reverse=True)
    elif sort == "daily_asc":
        out.sort(key=lambda x: x["daily_cost"])
    elif sort == "duration_desc":
        out.sort(key=lambda x: x["days"], reverse=True)
    elif sort == "duration_asc":
        out.sort(key=lambda x: x["days"])
    return out


@app.post("/api/assets", response_model=schemas.AssetOut, status_code=201)
def create_asset(payload: schemas.AssetIn, db: Session = Depends(get_db)):
    asset = models.Asset(id=models.new_id())
    _apply_payload(asset, payload.model_dump(), db)
    db.add(asset)
    db.commit()
    db.refresh(asset)
    crud.ensure_today_snapshot(db)
    return crud.serialize_asset(asset)


@app.get("/api/assets/{asset_id}", response_model=schemas.AssetOut)
def get_asset(asset_id: str, db: Session = Depends(get_db)):
    asset = db.get(models.Asset, asset_id)
    if not asset or asset.deleted_at is not None:
        raise HTTPException(404, "资产不存在")
    return crud.serialize_asset(asset)


@app.patch("/api/assets/{asset_id}", response_model=schemas.AssetOut)
def update_asset(asset_id: str, payload: schemas.AssetPatch, db: Session = Depends(get_db)):
    asset = db.get(models.Asset, asset_id)
    if not asset or asset.deleted_at is not None:
        raise HTTPException(404, "资产不存在")
    previous_image = asset.image_url
    _apply_payload(asset, payload.model_dump(exclude_unset=True), db)
    db.commit()
    db.refresh(asset)
    if previous_image != asset.image_url:
        remove_unreferenced_image(previous_image, db)
    crud.ensure_today_snapshot(db)
    return crud.serialize_asset(asset)


@app.delete("/api/assets/{asset_id}", status_code=204)
def delete_asset(asset_id: str, db: Session = Depends(get_db)):
    asset = db.get(models.Asset, asset_id)
    if not asset or asset.deleted_at is not None:
        raise HTTPException(404, "资产不存在")
    asset.deleted_at = datetime.utcnow()
    db.commit()
    crud.ensure_today_snapshot(db)


@app.post("/api/assets/{asset_id}/status", response_model=schemas.AssetOut)
def change_status(asset_id: str, payload: schemas.StatusIn, db: Session = Depends(get_db)):
    asset = db.get(models.Asset, asset_id)
    if not asset or asset.deleted_at is not None:
        raise HTTPException(404, "资产不存在")
    if payload.status in ("sold", "retired"):
        selected_date = crud.parse_date(payload.sold_date if payload.status == "sold" else payload.retired_date)
        if not selected_date:
            raise HTTPException(422, "请填写有效的日期")
        if selected_date > date.today() or (asset.purchase_date and selected_date < asset.purchase_date):
            raise HTTPException(422, "日期不能早于购买日期或晚于今天")
        if payload.status == "sold" and (payload.sold_price is None or not math.isfinite(payload.sold_price) or payload.sold_price < 0):
            raise HTTPException(422, "请填写有效的卖出价格")
    asset.status = payload.status
    if payload.status == "sold":
        asset.sold_price = payload.sold_price
        asset.sold_date = selected_date
        asset.retired_date = None
    if payload.status == "retired":
        asset.retired_date = selected_date
        asset.sold_price = None
        asset.sold_date = None
    if payload.status == "serving":
        asset.sold_price = None
        asset.sold_date = None
        asset.retired_date = None
    db.commit()
    db.refresh(asset)
    crud.ensure_today_snapshot(db)
    return crud.serialize_asset(asset)


@app.post("/api/assets/{asset_id}/use", response_model=schemas.AssetOut)
def use_asset(asset_id: str, count: int = 1, db: Session = Depends(get_db)):
    asset = db.get(models.Asset, asset_id)
    if not asset or asset.deleted_at is not None:
        raise HTTPException(404, "资产不存在")
    asset.used_count = (asset.used_count or 0) + max(1, count)
    db.commit()
    db.refresh(asset)
    crud.ensure_today_snapshot(db)
    return crud.serialize_asset(asset)


# ---------------------------------------------------------------- categories / tags


@app.post("/api/assets/{asset_id}/target/increment")
def increment_target(asset_id: str, db: Session = Depends(get_db)):
    query = db.query(models.Asset).filter(models.Asset.id == asset_id, models.Asset.deleted_at.is_(None), models.Asset.type == 'asset', models.Asset.status == 'serving', models.Asset.target_mode == 'custom')
    if not query.update({models.Asset.target_completed: models.Asset.target_completed + models.Asset.target_step}, synchronize_session=False):
        raise HTTPException(409, '仅使用中的自定义数量目标可以增加进度')
    db.commit()
    return crud.serialize_asset(db.get(models.Asset, asset_id))


@app.post("/api/wishes/reorder")
def reorder_wishes(payload: schemas.CategoryOrderIn, db: Session = Depends(get_db)):
    wishes = db.query(models.Asset).filter(models.Asset.type == 'wish', models.Asset.deleted_at.is_(None)).all()
    by_id = {a.id:a for a in wishes}
    if len(payload.ids) != len(set(payload.ids)) or set(payload.ids) != set(by_id):
        raise HTTPException(409, '心愿列表已变化，请刷新后重试')
    for index, ident in enumerate(payload.ids): by_id[ident].sort = index
    db.commit()
    return {'ok':True}


@app.get("/api/categories", response_model=List[schemas.CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    cats = db.query(models.Category).order_by(models.Category.sort, models.Category.name).all()
    return [crud.serialize_category(c) for c in cats]


@app.post("/api/categories", response_model=schemas.CategoryOut, status_code=201)
def create_category(payload: schemas.CategoryIn, db: Session = Depends(get_db)):
    cat = models.Category(**payload.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return crud.serialize_category(cat)


@app.post("/api/categories/reorder", response_model=List[schemas.CategoryOut])
def reorder_categories(payload: schemas.CategoryOrderIn, db: Session = Depends(get_db)):
    categories = db.query(models.Category).all()
    by_id = {c.id: c for c in categories}
    if len(payload.ids) != len(set(payload.ids)) or set(payload.ids) != set(by_id):
        raise HTTPException(409, "分类列表已变化，请刷新后重试")
    for index, category_id in enumerate(payload.ids):
        by_id[category_id].sort = index
    db.commit()
    return [crud.serialize_category(by_id[category_id]) for category_id in payload.ids]


@app.patch("/api/categories/{cat_id}", response_model=schemas.CategoryOut)
def update_category(cat_id: str, payload: schemas.CategoryIn, db: Session = Depends(get_db)):
    cat = db.get(models.Category, cat_id)
    if not cat:
        raise HTTPException(404, "分类不存在")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(cat, k, v)
    db.commit()
    db.refresh(cat)
    return crud.serialize_category(cat)


@app.delete("/api/categories/{cat_id}", status_code=204)
def delete_category(cat_id: str, db: Session = Depends(get_db)):
    cat = db.get(models.Category, cat_id)
    if not cat:
        raise HTTPException(404, "分类不存在")
    db.query(models.Asset).filter(models.Asset.category_id == cat_id).update({"category_id": None})
    db.delete(cat)
    db.commit()


@app.get("/api/tags", response_model=List[schemas.TagOut])
def list_tags(db: Session = Depends(get_db)):
    tags = db.query(models.Tag).order_by(models.Tag.sort, models.Tag.name).all()
    return [crud.serialize_tag(t) for t in tags]


@app.post("/api/tags", response_model=schemas.TagOut, status_code=201)
def create_tag(payload: schemas.TagIn, db: Session = Depends(get_db)):
    tag = models.Tag(**payload.model_dump())
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return crud.serialize_tag(tag)


@app.post("/api/tags/reorder", response_model=List[schemas.TagOut])
def reorder_tags(payload: schemas.TagOrderIn, db: Session = Depends(get_db)):
    tags = db.query(models.Tag).all()
    by_id = {tag.id: tag for tag in tags}
    if len(payload.ids) != len(set(payload.ids)) or set(payload.ids) != set(by_id):
        raise HTTPException(409, "标签列表已变化，请刷新后重试")
    for index, tag_id in enumerate(payload.ids):
        by_id[tag_id].sort = index
    db.commit()
    return [crud.serialize_tag(by_id[tag_id]) for tag_id in payload.ids]


@app.patch("/api/tags/{tag_id}", response_model=schemas.TagOut)
def update_tag(tag_id: str, payload: schemas.TagIn, db: Session = Depends(get_db)):
    tag = db.get(models.Tag, tag_id)
    if not tag:
        raise HTTPException(404, "标签不存在")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(tag, k, v)
    db.commit()
    db.refresh(tag)
    return crud.serialize_tag(tag)


@app.delete("/api/tags/{tag_id}", status_code=204)
def delete_tag(tag_id: str, db: Session = Depends(get_db)):
    tag = db.get(models.Tag, tag_id)
    if not tag:
        raise HTTPException(404, "标签不存在")
    tag.assets = []
    db.delete(tag)
    db.commit()


# ---------------------------------------------------------------- stats


@app.get("/api/stats", response_model=schemas.StatsOut)
def stats(
    status: Optional[str] = None,
    category_id: Optional[str] = None,
    tag_id: Optional[str] = None,
    q: Optional[str] = None,
    range: str = "all",
    db: Session = Depends(get_db),
):
    assets = db.query(models.Asset).filter(models.Asset.deleted_at.is_(None)).all()
    crud.ensure_today_snapshot(db)

    scoped = [a for a in assets if a.type == "asset"]
    if category_id:
        scoped = [a for a in scoped if a.category_id == category_id]
    if tag_id:
        scoped = [a for a in scoped if any(t.id == tag_id for t in a.tags)]
    if q:
        key = q.lower()
        scoped = [
            a
            for a in scoped
            if key in (a.name or "").lower() or key in (a.notes or "").lower()
        ]

    filtered = scoped
    if status and status != "all":
        filtered = [a for a in filtered if a.status == status]

    data = crud.compute_stats(filtered)
    wishes = [a for a in assets if a.type == "wish"]
    data["wish_total"] = round(sum(a.price or 0 for a in wishes), 2)
    data["wish_count"] = len(wishes)
    data["scope_count"] = len(scoped)
    data["total_count"] = len([a for a in assets if a.type == "asset"])
    if range == "all":
        data["trend"] = crud.trend_from_snapshots(db)
    return data


# ---------------------------------------------------------------- backup


@app.get("/api/export")
def export_data(db: Session = Depends(get_db)):
    cats = db.query(models.Category).all()
    tags = db.query(models.Tag).all()
    assets = db.query(models.Asset).filter(models.Asset.deleted_at.is_(None)).all()
    payload = {
        "version": 1,
        "exported_at": datetime.utcnow().isoformat(),
        "categories": [
            {"name": c.name, "icon": c.icon, "color": c.color, "sort": c.sort} for c in cats
        ],
        "tags": [{"name": t.name, "color": t.color, "sort": t.sort} for t in tags],
        "assets": [
            {
                **{k: v for k, v in crud.serialize_asset(a).items() if k not in ("category_name", "category_icon", "category_color", "tags")},
                "category_name": a.category.name if a.category else None,
                "tag_names": [t.name for t in a.tags],
            }
            for a in assets
        ],
    }
    return JSONResponse(
        payload,
        headers={"Content-Disposition": f"attachment; filename=keeps-backup-{date.today().isoformat()}.json"},
    )


@app.post("/api/import")
def import_data(body: dict, db: Session = Depends(get_db)):
    raise HTTPException(410, "旧 JSON 覆盖导入已停用，请使用完整备份包的预览与恢复入口")


@app.post("/api/reset")
def reset_data(seed: bool = False, db: Session = Depends(get_db)):
    db.query(models.Asset).delete()
    db.query(models.Category).delete()
    db.query(models.Tag).delete()
    db.query(models.ValueSnapshot).delete()
    db.commit()
    if seed:
        from .seed import seed_if_empty

        seed_if_empty()
    return {"ok": True}


# ---------------------------------------------------------------- static frontend

DIST = Path(__file__).resolve().parent.parent.parent / "web" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        file = (DIST / full_path).resolve()
        if full_path and DIST.resolve() in file.parents and file.is_file():
            return FileResponse(file)
        return FileResponse(DIST / "index.html")
