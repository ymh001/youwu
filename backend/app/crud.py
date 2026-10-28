from datetime import date, datetime
from typing import List, Optional

from . import models
from sqlalchemy.orm import object_session


def parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def end_date(asset: models.Asset, today: date) -> date:
    if asset.status == "sold" and asset.sold_date:
        return asset.sold_date
    if asset.status == "retired" and asset.retired_date:
        return asset.retired_date
    return today


def days_in_service(asset: models.Asset, today: Optional[date] = None) -> int:
    today = today or date.today()
    start = asset.purchase_date or asset.wish_date or today
    end = end_date(asset, today)
    return max(1, (end - start).days + 1)


def total_cost(asset: models.Asset) -> float:
    """Net cost: sold assets deduct the sale price (can be negative = profit)."""
    if asset.type == "wish":
        return round(asset.price or 0, 2)
    cost = asset.price or 0
    if asset.status == "sold":
        cost -= asset.sold_price or 0
    return round(cost, 2)


def daily_cost(asset: models.Asset, today: Optional[date] = None) -> float:
    if asset.type == "wish":
        return 0.0
    if asset.cost_rule == "per_use":
        return round(total_cost(asset) / max(1, asset.used_count or 1), 2)
    if asset.cost_rule == "custom" and asset.custom_daily is not None:
        return round(asset.custom_daily, 2)
    return round(total_cost(asset) / days_in_service(asset, today), 2)


def asset_value(asset: models.Asset) -> float:
    if asset.exclude_total:
        return 0.0
    return total_cost(asset)


def serialize_tag(tag: models.Tag) -> dict:
    return {"id": tag.id, "name": tag.name, "color": tag.color, "sort": tag.sort}


def serialize_category(cat: models.Category) -> dict:
    return {"id": cat.id, "name": cat.name, "icon": cat.icon, "color": cat.color, "sort": cat.sort}


def serialize_asset(asset: models.Asset, today: Optional[date] = None) -> dict:
    today = today or date.today()
    db = object_session(asset)
    if db and '_attachment_map' not in db.info:
        file_map = {}
        for file in db.query(models.Attachment).all():
            file_map.setdefault(file.asset_id, []).append(file)
        db.info['_attachment_map'] = file_map
    files = db.info['_attachment_map'].get(asset.id, []) if db else []
    combined = total_cost(asset)
    if db:
        if '_children_map' not in db.info:
            children = {}
            for item in db.query(models.Asset).filter(models.Asset.deleted_at.is_(None)).all():
                if item.parent_id and item.include_in_parent:
                    children.setdefault(item.parent_id, []).append(item)
            db.info['_children_map'] = children
        children = db.info['_children_map']
        visited = {asset.id}
        def add_children(parent):
            value = 0
            for child in children.get(parent, []):
                if child.id not in visited:
                    visited.add(child.id)
                    value += total_cost(child) + add_children(child.id)
            return value
        combined += add_children(asset.id)
    divisor = max(1, asset.used_count or 1) if asset.cost_rule == "per_use" else days_in_service(asset, today)
    combined_daily = asset.custom_daily if asset.cost_rule == "custom" and asset.custom_daily is not None else combined / divisor
    return {
        "id": asset.id,
        "name": asset.name,
        "price": round(asset.price or 0, 2),
        "type": asset.type,
        "status": asset.status,
        "purchase_date": asset.purchase_date.isoformat() if asset.purchase_date else None,
        "category_id": asset.category_id,
        "category_name": asset.category.name if asset.category else None,
        "category_icon": asset.category.icon if asset.category else None,
        "category_color": asset.category.color if asset.category else None,
        "tags": [serialize_tag(t) for t in asset.tags],
        "icon": asset.icon or "📦",
        "image_url": asset.image_url,
        "notes": asset.notes or "",
        "parent_id": asset.parent_id,
        "show_on_home": bool(asset.show_on_home),
        "include_in_parent": bool(asset.include_in_parent),
        "legacy_data": asset.legacy_data,
        "attachments": [{"id": f.id, "name": f.name, "size": f.size, "url": f"/api/attachments/{f.id}"} for f in files],
        "attachment_ids": [f.id for f in files],
        "combined_cost": round(combined, 2),
        "combined_daily": round(combined_daily, 2) if asset.type == "asset" else 0,

        "cost_rule": asset.cost_rule,
        "used_count": asset.used_count or 0,
        "custom_daily": asset.custom_daily,
        "target_daily": asset.target_daily,
        "target_mode": asset.target_mode or "none",
        "target_date": asset.target_date,
        "target_quantity": asset.target_quantity,
        "target_unit": asset.target_unit or "次",
        "target_step": asset.target_step or 1,
        "target_completed": asset.target_completed or 0,
        "is_pinned": bool(asset.is_pinned),
        "exclude_total": bool(asset.exclude_total),
        "exclude_daily": bool(asset.exclude_daily),
        "sold_price": asset.sold_price,
        "sold_date": asset.sold_date.isoformat() if asset.sold_date else None,
        "retired_date": asset.retired_date.isoformat() if asset.retired_date else None,
        "wish_date": asset.wish_date.isoformat() if asset.wish_date else None,
        "daily_cost": daily_cost(asset, today),
        "total_cost": total_cost(asset),
        "days": days_in_service(asset, today) if asset.purchase_date else 0,
        "created_at": asset.created_at.isoformat() if asset.created_at else None,
    }


def monthly_trend(assets: List[models.Asset]) -> List[dict]:
    """Cumulative value by month of purchase (serving + retired + sold)."""
    points = {}
    today = date.today()
    for a in assets:
        if a.type == "wish" or not a.purchase_date:
            continue
        key = a.purchase_date.strftime("%Y-%m")
        points[key] = points.get(key, 0.0) + (a.price or 0)
    if not points:
        return []
    labels = sorted(points.keys())
    out = []
    total = 0.0
    for label in labels:
        total += points[label]
        out.append({"label": label, "value": round(total, 2)})
    # ensure we end at current month
    if labels[-1] != today.strftime("%Y-%m"):
        out.append({"label": today.strftime("%Y-%m"), "value": round(total, 2)})
    return out[-12:]


def monthly_added(assets: List[models.Asset]) -> List[dict]:
    months = {}
    today = date.today()
    for a in assets:
        if a.type == "wish" or not a.purchase_date:
            continue
        key = a.purchase_date.strftime("%Y-%m")
        slot = months.setdefault(key, {"label": key, "added_value": 0.0, "added_count": 0})
        slot["added_value"] += a.price or 0
        slot["added_count"] += 1
    # fill last 12 months
    out = []
    y, m = today.year, today.month
    seq = []
    for _ in range(12):
        seq.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    for key in reversed(seq):
        slot = months.get(key, {"label": key, "added_value": 0.0, "added_count": 0})
        out.append({"label": key, "added_value": round(slot["added_value"], 2), "added_count": slot["added_count"]})
    return out


def compute_stats(assets: List[models.Asset]) -> dict:
    today = date.today()
    serving = [a for a in assets if a.type == "asset" and a.status == "serving"]
    retired = [a for a in assets if a.type == "asset" and a.status == "retired"]
    sold = [a for a in assets if a.type == "asset" and a.status == "sold"]
    wishes = [a for a in assets if a.type == "wish"]

    def bucket(items):
        return {
            "count": len(items),
            "value": round(sum(asset_value(a) for a in items), 2),
            "daily": round(sum(daily_cost(a, today) for a in items if not a.exclude_daily and a.cost_rule != "per_use"), 2),
        }

    total_value = round(sum(asset_value(a) for a in assets if a.type == "asset"), 2)
    total_daily = round(
        sum(daily_cost(a, today) for a in assets if a.type == "asset" and not a.exclude_daily and a.cost_rule != "per_use"), 2
    )

    cat_map = {}
    for a in assets:
        if a.type != "asset" or a.status != "serving":
            continue
        key = a.category_id or "uncategorized"
        slot = cat_map.setdefault(
            key,
            {
                "id": key,
                "name": a.category.name if a.category else "未分类",
                "icon": a.category.icon if a.category else "",
                "color": a.category.color if a.category else "#94A3B8",
                "value": 0.0,
                "count": 0,
            },
        )
        slot["value"] += asset_value(a)
        slot["count"] += 1
    categories = []
    for slot in sorted(cat_map.values(), key=lambda x: -x["value"]):
        slot["value"] = round(slot["value"], 2)
        slot["pct"] = round(slot["value"] / total_value * 100, 2) if total_value else 0
        categories.append(slot)

    return {
        "total_value": total_value,
        "total_daily": total_daily,
        "count": len([a for a in assets if a.type == "asset"]),
        "serving_count": len(serving),
        "retired_count": len(retired),
        "sold_count": len(sold),
        "by_status": {
            "serving": bucket(serving),
            "retired": bucket(retired),
            "sold": bucket(sold),
        },
        "categories": categories,
        "trend": monthly_trend(assets),
        "months": monthly_added(assets),
        "wish_total": round(sum(a.price or 0 for a in wishes), 2),
        "wish_count": len(wishes),
        "avg_daily": round(total_daily / len(serving), 2) if serving else 0,
        "scope_count": len([a for a in assets if a.type == "asset"]),
        "total_count": len([a for a in assets if a.type == "asset"]),
    }


def snapshot_totals(assets: List[models.Asset]) -> dict:
    today = date.today()
    serving = [a for a in assets if a.type == "asset" and a.status == "serving"]
    retired = [a for a in assets if a.type == "asset" and a.status == "retired"]
    sold = [a for a in assets if a.type == "asset" and a.status == "sold"]
    return {
        "total_value": round(sum(asset_value(a) for a in assets if a.type == "asset"), 2),
        "total_daily": round(sum(daily_cost(a, today) for a in serving if not a.exclude_daily and a.cost_rule != "per_use"), 2),
        "serving_count": len(serving),
        "retired_count": len(retired),
        "sold_count": len(sold),
    }


def ensure_today_snapshot(db) -> None:
    """Upsert one real snapshot per day (called after mutations and on reads)."""
    today = date.today().isoformat()
    row = db.query(models.ValueSnapshot).filter(models.ValueSnapshot.date == today).first()
    totals = snapshot_totals(db.query(models.Asset).filter(models.Asset.deleted_at.is_(None)).all())
    if row is None:
        row = models.ValueSnapshot(date=today, **totals)
        db.add(row)
    else:
        for k, v in totals.items():
            setattr(row, k, v)
    db.commit()


def trend_from_snapshots(db, days: int = 365) -> List[dict]:
    rows = (
        db.query(models.ValueSnapshot)
        .order_by(models.ValueSnapshot.date.asc())
        .all()
    )
    if not rows:
        return []
    return [{"label": r.date, "value": round(r.total_value, 2)} for r in rows[-days:]]
