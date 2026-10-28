from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    icon: str = ""
    color: str = "#84CC16"
    sort: int = 0


class CategoryOut(CategoryIn):
    id: str


class TagIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    color: str = "#94A3B8"
    sort: int = 0


class TagOut(TagIn):
    id: str


class AssetIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    price: float = 0
    type: Literal["asset", "wish"] = "asset"
    status: Literal["serving", "retired", "sold"] = "serving"

    purchase_date: Optional[str] = None
    category_id: Optional[str] = None
    tag_ids: List[str] = []
    icon: str = "📦"
    image_url: Optional[str] = None
    notes: str = ""
    parent_id: Optional[str] = None
    show_on_home: bool = True
    include_in_parent: bool = True
    attachment_ids: List[str] = []

    cost_rule: Literal["per_day", "per_use", "custom"] = "per_day"
    used_count: int = 0
    custom_daily: Optional[float] = None
    target_daily: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    target_mode: Literal["none", "price", "date", "custom"] = "none"
    target_date: Optional[str] = None
    target_quantity: Optional[float] = Field(default=None, gt=0, allow_inf_nan=False)
    target_unit: str = Field(default="次", min_length=1, max_length=16)
    target_step: float = Field(default=1, gt=0, allow_inf_nan=False)
    target_completed: float = Field(default=0, ge=0, allow_inf_nan=False)

    is_pinned: bool = False
    exclude_total: bool = False
    exclude_daily: bool = False

    sold_price: Optional[float] = None
    sold_date: Optional[str] = None
    retired_date: Optional[str] = None
    wish_date: Optional[str] = None


class AssetPatch(AssetIn):
    name: Optional[str] = None
    price: Optional[float] = None
    type: Optional[Literal["asset", "wish"]] = None
    status: Optional[Literal["serving", "retired", "sold"]] = None
    cost_rule: Optional[Literal["per_day", "per_use", "custom"]] = None


class StatusIn(BaseModel):
    status: Literal["serving", "retired", "sold"]
    sold_price: Optional[float] = None
    sold_date: Optional[str] = None
    retired_date: Optional[str] = None


class AssetOut(BaseModel):
    id: str
    name: str
    price: float
    type: str
    status: str
    purchase_date: Optional[str] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    category_icon: Optional[str] = None
    category_color: Optional[str] = None
    tags: List[TagOut] = []
    icon: str = "📦"
    image_url: Optional[str] = None
    notes: str = ""
    parent_id: Optional[str] = None
    show_on_home: bool = True
    include_in_parent: bool = True
    attachment_ids: List[str] = []
    cost_rule: str = "per_day"
    used_count: int = 0
    custom_daily: Optional[float] = None
    target_daily: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    target_mode: Literal["none", "price", "date", "custom"] = "none"
    target_date: Optional[str] = None
    target_quantity: Optional[float] = Field(default=None, gt=0, allow_inf_nan=False)
    target_unit: str = Field(default="次", min_length=1, max_length=16)
    target_step: float = Field(default=1, gt=0, allow_inf_nan=False)
    target_completed: float = Field(default=0, ge=0, allow_inf_nan=False)
    is_pinned: bool = False
    exclude_total: bool = False
    exclude_daily: bool = False
    sold_price: Optional[float] = None
    sold_date: Optional[str] = None
    retired_date: Optional[str] = None
    wish_date: Optional[str] = None
    attachments: List[dict] = []
    combined_cost: float = 0
    combined_daily: float = 0
    legacy_data: Optional[str] = None
    daily_cost: float = 0
    total_cost: float = 0
    days: int = 0
    created_at: Optional[str] = None


class StatusBucket(BaseModel):
    count: int
    value: float
    daily: float


class CategoryStat(BaseModel):
    id: str
    name: str
    icon: str
    color: str
    value: float
    count: int
    pct: float


class TrendPoint(BaseModel):
    label: str
    value: float


class MonthPoint(BaseModel):
    label: str
    added_value: float
    added_count: int


class StatsOut(BaseModel):
    total_value: float
    total_daily: float
    count: int
    serving_count: int
    retired_count: int
    sold_count: int
    by_status: dict
    categories: List[CategoryStat]
    trend: List[TrendPoint]
    months: List[MonthPoint]
    wish_total: float
    wish_count: int
    avg_daily: float
    scope_count: int = 0
    total_count: int = 0


class ImportPayload(BaseModel):
    version: int = 1
    categories: List[CategoryIn] = []
    tags: List[TagIn] = []
    assets: List[AssetIn] = []


class CategoryOrderIn(BaseModel):
    ids: List[str]


class TagOrderIn(BaseModel):
    ids: List[str]
