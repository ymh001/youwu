from datetime import date, timedelta

from . import models
from .db import SessionLocal


def seed_if_empty() -> None:
    db = SessionLocal()
    try:
        if db.query(models.Asset).count() > 0 or db.query(models.Category).count() > 0:
            return

        cats = [
            ("手机", "📱", "#84CC16"),
            ("电脑", "💻", "#22D3EE"),
            ("影音", "🎧", "#818CF8"),
            ("家电", "🔌", "#F59E0B"),
            ("家具", "🪑", "#A78BFA"),
            ("工具", "🔧", "#94A3B8"),
            ("出行", "🚲", "#34D399"),
        ]
        cat_objs = {}
        for i, (name, icon, color) in enumerate(cats):
            c = models.Category(name=name, icon=icon, color=color, sort=i)
            db.add(c)
            cat_objs[name] = c
        db.flush()

        tags = [("京东", "#E1251B"), ("淘宝", "#FF5000"), ("闲鱼", "#FBBF24"), ("自购", "#60A5FA")]
        tag_objs = {}
        for i, (name, color) in enumerate(tags):
            t = models.Tag(name=name, color=color, sort=i)
            db.add(t)
            tag_objs[name] = t
        db.flush()

        today = date.today()

        def d(days_ago: int) -> date:
            return today - timedelta(days=days_ago)

        demo = [
            dict(name="MacBook Pro", price=12999, icon="💻", category="电脑", days=420, tags=["自购"], image="laptop", notes="日常工作与创作"),
            dict(name="我的日常手机", price=4999, icon="📱", category="手机", days=300, tags=["自购"], image="phone"),
            dict(name="白色头戴耳机", price=1299, icon="🎧", category="影音", days=240, tags=["自购"], image="headphones", target=3),
            dict(name="旅行相机", price=6299, icon="📷", category="影音", days=620, tags=["自购"], image="camera"),
            dict(name="有线监听耳机", price=899, icon="🎧", category="影音", days=900, tags=["自购"], image="wired-headphones", status="retired"),
            dict(name="旧款备用手机", price=2999, icon="📱", category="手机", days=1100, tags=["自购"], image="phone", status="sold", sold_price=800, sold_days=200),
        ]

        for item in demo:
            status = item.get("status", "serving")
            a = models.Asset(
                name=item["name"],
                price=item["price"],
                type="asset",
                status=status,
                purchase_date=d(item["days"]),
                category=cat_objs[item["category"]],
                icon=item["icon"],
                notes="[演示资料] 价格与日期仅供体验。" + item.get("notes", ""),
                image_url=None,
                target_daily=item.get("target"),
                is_pinned=item["name"].startswith("MacBook"),
            )
            if status == "sold":
                a.sold_price = item["sold_price"]
                a.sold_date = d(item["sold_days"])
            if status == "retired":
                a.retired_date = d(30)
            a.tags = [tag_objs[t] for t in item["tags"]]
            db.add(a)

        wishes = [
            ("IQUNIX MG75 Pro", 939, "⌨️", 45),
            ("Apple Watch S8 45mm", 1750, "⌚", 90),
            ("Bose QC Ultra", 2299, "🎧", 12),
        ]
        for name, price, icon, days_ago in wishes:
            db.add(
                models.Asset(
                    name=name,
                    price=price,
                    type="wish",
                    status="serving",
                    icon=icon,
                    wish_date=d(days_ago),
                    notes="心愿单",
                )
            )

        db.commit()
        from . import crud

        crud.ensure_today_snapshot(db)
    finally:
        db.close()
