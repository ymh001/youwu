import type { Asset, Stats } from "../types";

export type RangeKey = "all" | "month" | "7d" | "30d" | "90d" | "180d" | "365d";

export const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: "all", label: "全部" },
  { key: "month", label: "本月" },
  { key: "7d", label: "近7天" },
  { key: "30d", label: "近30天" },
  { key: "90d", label: "近90天" },
  { key: "180d", label: "近180天" },
  { key: "365d", label: "近365天" },
];

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function rangeStart(range: RangeKey, now = new Date()): Date | null {
  const day = 24 * 3600 * 1000;
  switch (range) {
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "7d":
      return new Date(now.getTime() - 7 * day);
    case "30d":
      return new Date(now.getTime() - 30 * day);
    case "90d":
      return new Date(now.getTime() - 90 * day);
    case "180d":
      return new Date(now.getTime() - 180 * day);
    case "365d":
      return new Date(now.getTime() - 365 * day);
    default:
      return null;
  }
}

export function filterByRange(assets: Asset[], range: RangeKey, now = new Date()): Asset[] {
  const start = rangeStart(range, now);
  if (!start) return assets;
  return assets.filter((a) => {
    const d = parseDate(a.purchase_date || a.wish_date);
    return d !== null && d >= start;
  });
}

export function assetValue(a: Asset): number {
  if (a.exclude_total) return 0;
  return a.total_cost ?? a.price;
}

export function assetDaily(a: Asset): number {
  if (a.exclude_daily || a.cost_rule === "per_use") return 0;
  return a.daily_cost;
}

export interface ScopedStats {
  totalValue: number;
  totalDaily: number;
  counts: { serving: number; retired: number; sold: number };
  filteredCount: number;
  scopeCount: number;
  statusValue: { serving: number; retired: number; sold: number };
}

export function computeScopedStats(
  assets: Asset[],
  opts: { status?: string; categoryId?: string; q?: string } = {},
): ScopedStats {
  const key = (opts.q || "").trim().toLowerCase();
  const scope = assets.filter((a) => {
    if (a.type !== "asset") return false;
    if (
      opts.categoryId &&
      opts.categoryId !== "all" &&
      a.category_id !== opts.categoryId
    )
      return false;
    if (key) {
      const text =
        `${a.name} ${a.notes || ""} ${a.category_name || ""}`.toLowerCase();
      if (!text.includes(key)) return false;
    }
    return true;
  });
  const filtered =
    !opts.status || opts.status === "all"
      ? scope
      : scope.filter((a) => a.status === opts.status);

  const counts = { serving: 0, retired: 0, sold: 0 };
  const statusValue = { serving: 0, retired: 0, sold: 0 };
  let totalValue = 0;
  let totalDaily = 0;
  for (const a of filtered) {
    counts[a.status] += 1;
    statusValue[a.status] += assetValue(a);
    totalValue += assetValue(a);
    totalDaily += assetDaily(a);
  }
  return {
    totalValue: round(totalValue),
    totalDaily: round(totalDaily),
    counts,
    filteredCount: filtered.length,
    scopeCount: scope.length,
    statusValue: {
      serving: round(statusValue.serving),
      retired: round(statusValue.retired),
      sold: round(statusValue.sold),
    },
  };
}

export interface RangeStats {
  totalValue: number;
  count: number;
  byStatus: { serving: number; retired: number; sold: number };
  statusValue: { serving: number; retired: number; sold: number };
  categories: Stats["categories"];
  months: Array<{ label: string; added_value: number; added_count: number }>;
  series: Array<{ label: string; value: number }>;
  top: Asset[];
}

export function computeRangeStats(
  assets: Asset[],
  range: RangeKey,
  now = new Date(),
): RangeStats {
  const scoped = filterByRange(
    assets.filter((a) => a.type === "asset"),
    range,
    now,
  );
  const totalValue = round(scoped.reduce((s, a) => s + assetValue(a), 0));
  const byStatus = { serving: 0, retired: 0, sold: 0 };
  const statusValue = { serving: 0, retired: 0, sold: 0 };
  const catMap = new Map<
    string,
    {
      id: string;
      name: string;
      icon: string;
      color: string;
      value: number;
      count: number;
    }
  >();
  const monthMap = new Map<
    string,
    { label: string; added_value: number; added_count: number }
  >();

  for (const a of scoped) {
    byStatus[a.status] += 1;
    statusValue[a.status] += assetValue(a);
    const catKey = a.category_id || "uncategorized";
    const cat = catMap.get(catKey) || {
      id: catKey,
      name: a.category_name || "未分类",
      icon: a.category_icon || "",
      color: a.category_color || "#94A3B8",
      value: 0,
      count: 0,
    };
    cat.value += assetValue(a);
    cat.count += 1;
    catMap.set(catKey, cat);

    const d = parseDate(a.purchase_date);
    if (d) {
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const slot = monthMap.get(label) || {
        label,
        added_value: 0,
        added_count: 0,
      };
      slot.added_value += assetValue(a);
      slot.added_count += 1;
      monthMap.set(label, slot);
    }
  }

  const categories = [...catMap.values()]
    .sort((a, b) => b.value - a.value)
    .map((c) => ({
      ...c,
      value: round(c.value),
      pct: totalValue ? round((c.value / totalValue) * 100) : 0,
    }));

  const months = [...monthMap.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((m) => ({ ...m, added_value: round(m.added_value) }));

  // cumulative series by purchase date
  const dated = scoped
    .map((a) => ({ date: parseDate(a.purchase_date), value: assetValue(a) }))
    .filter((x): x is { date: Date; value: number } => x.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const series: Array<{ label: string; value: number }> = [];
  let running = 0;
  for (const item of dated) {
    running += item.value;
    const label = `${item.date.getMonth() + 1}.${String(item.date.getDate()).padStart(2, "0")}`;
    if (series.length && series[series.length - 1].label === label) {
      series[series.length - 1].value = round(running);
    } else {
      series.push({ label, value: round(running) });
    }
  }
  if (
    series.length &&
    (range === "all" || series[series.length - 1].label !== "今天")
  ) {
    const last = series[series.length - 1];
    if (last.value !== totalValue)
      series.push({ label: "今天", value: totalValue });
  }

  const top = scoped
    .filter((a) => a.status === "serving" && !a.exclude_daily)
    .sort((a, b) => b.daily_cost - a.daily_cost)
    .slice(0, 5);

  return {
    totalValue,
    count: scoped.length,
    byStatus,
    statusValue: {
      serving: round(statusValue.serving),
      retired: round(statusValue.retired),
      sold: round(statusValue.sold),
    },
    categories,
    months,
    series,
    top,
  };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
