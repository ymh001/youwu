import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
)
from sqlalchemy.orm import relationship

from .db import Base


def new_id() -> str:
    return uuid.uuid4().hex


asset_tags = Table(
    "asset_tags",
    Base.metadata,
    Column("asset_id", String(32), ForeignKey("assets.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", String(32), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Category(Base):
    __tablename__ = "categories"

    id = Column(String(32), primary_key=True, default=new_id)
    name = Column(String(64), nullable=False)
    icon = Column(String(32), default="")
    color = Column(String(16), default="#84CC16")
    sort = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class Tag(Base):
    __tablename__ = "tags"

    id = Column(String(32), primary_key=True, default=new_id)
    name = Column(String(64), nullable=False)
    color = Column(String(16), default="#94A3B8")
    sort = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class Asset(Base):
    __tablename__ = "assets"

    id = Column(String(32), primary_key=True, default=new_id)
    name = Column(String(128), nullable=False)
    price = Column(Float, nullable=False, default=0.0)
    type = Column(String(16), nullable=False, default="asset")  # asset | wish
    status = Column(String(16), nullable=False, default="serving")  # serving | retired | sold

    purchase_date = Column(Date, nullable=True)
    category_id = Column(String(32), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    icon = Column(String(32), default="📦")
    image_url = Column(String(512), nullable=True)
    notes = Column(Text, default="")
    parent_id = Column(String(32), nullable=True, index=True)
    show_on_home = Column(Boolean, default=True)
    include_in_parent = Column(Boolean, default=True)
    legacy_data = Column(Text, nullable=True)

    cost_rule = Column(String(16), default="per_day")  # per_day | per_use | custom
    used_count = Column(Integer, default=0)
    custom_daily = Column(Float, nullable=True)
    target_daily = Column(Float, nullable=True)
    target_mode = Column(String(16), default="none")
    target_date = Column(String(10), nullable=True)
    target_quantity = Column(Float, nullable=True)
    target_unit = Column(String(16), default="次")
    target_step = Column(Float, default=1)
    target_completed = Column(Float, default=0)

    is_pinned = Column(Boolean, default=False)
    exclude_total = Column(Boolean, default=False)
    exclude_daily = Column(Boolean, default=False)

    sold_price = Column(Float, nullable=True)
    sold_date = Column(Date, nullable=True)
    retired_date = Column(Date, nullable=True)
    wish_date = Column(Date, nullable=True)

    deleted_at = Column(DateTime, nullable=True, index=True)
    sort = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category = relationship("Category", lazy="joined")
    tags = relationship("Tag", secondary=asset_tags, lazy="selectin")


class ValueSnapshot(Base):
    __tablename__ = "value_snapshots"

    id = Column(String(32), primary_key=True, default=new_id)
    date = Column(String(10), nullable=False, unique=True, index=True)
    total_value = Column(Float, default=0.0)
    total_daily = Column(Float, default=0.0)
    serving_count = Column(Integer, default=0)
    retired_count = Column(Integer, default=0)
    sold_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AppSetting(Base):
    __tablename__ = "app_settings"
    key = Column(String(64), primary_key=True)
    value = Column(Text, nullable=False)


class Attachment(Base):
    __tablename__ = "attachments"
    id = Column(String(32), primary_key=True, default=new_id)
    asset_id = Column(String(32), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    size = Column(Integer, nullable=False)
    is_archive = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
