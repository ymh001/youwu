export type AssetType = "asset" | "wish";
export type AssetStatus = "serving" | "retired" | "sold";
export type CostRule = "per_day" | "per_use" | "custom";

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  sort: number;
}

export interface Asset {
  id: string;
  name: string;
  price: number;
  type: AssetType;
  status: AssetStatus;
  purchase_date: string | null;
  category_id: string | null;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  tags: Tag[];
  icon: string;
  image_url: string | null;
  notes: string;
  parent_id: string | null;
  show_on_home: boolean;
  include_in_parent: boolean;
  attachments: Attachment[];
  attachment_ids?: string[];
  combined_cost: number;
  combined_daily: number;
  legacy_data?: string | null;
  cost_rule: CostRule;
  used_count: number;
  custom_daily: number | null;
  target_daily: number | null;
  target_mode: 'none' | 'price' | 'date' | 'custom';
  target_date: string | null;
  target_quantity: number | null;
  target_unit: string;
  target_step: number;
  target_completed: number;
  is_pinned: boolean;
  exclude_total: boolean;
  exclude_daily: boolean;
  sold_price: number | null;
  sold_date: string | null;
  retired_date: string | null;
  wish_date: string | null;
  daily_cost: number;
  total_cost: number;
  days: number;
  created_at: string | null;
}

export type AssetInput = Partial<
  Omit<
    Asset,
    | "id"
    | "daily_cost"
    | "days"
    | "category_name"
    | "category_icon"
    | "category_color"
    | "created_at"
  >
> & { tag_ids?: string[] };

export interface Stats {
  total_value: number;
  total_daily: number;
  count: number;
  serving_count: number;
  retired_count: number;
  sold_count: number;
  by_status: Record<
    AssetStatus,
    { count: number; value: number; daily: number }
  >;
  categories: Array<{
    id: string;
    name: string;
    icon: string;
    color: string;
    value: number;
    count: number;
    pct: number;
  }>;
  trend: Array<{ label: string; value: number }>;
  months: Array<{ label: string; added_value: number; added_count: number }>;
  wish_total: number;
  wish_count: number;
  avg_daily: number;
  scope_count: number;
  total_count: number;
}

export interface Attachment { id: string; name: string; size: number; url: string; }
