import type { Asset } from "../types";
import type { RangeKey } from "./stats";

const DAY = 86_400_000;
const dateValue = (value: string) =>
  Date.parse(value.slice(0, 10) + "T00:00:00Z");
export function dailyTrend(assets: Asset[], range: RangeKey, now = new Date()) {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const eligible = assets.filter(
    (a) =>
      a.type === "asset" &&
      !a.exclude_daily &&
      a.cost_rule !== "per_use" &&
      a.purchase_date &&
      Number.isFinite(dateValue(a.purchase_date)) &&
      dateValue(a.purchase_date) <= today,
  );
  if (!eligible.length) return [];
  const earliest = Math.min(
    ...eligible.map((a) => dateValue(a.purchase_date!)),
  );
  const requested =
    range === "all"
      ? earliest
      : range === "month"
        ? Date.UTC(now.getFullYear(), now.getMonth(), 1)
        : today - (Number.parseInt(range) - 1) * DAY;
  const start = Math.max(earliest, requested);
  const days = Math.round((today - start) / DAY);
  const steps = days;
  return Array.from({ length: steps + 1 }, (_, index) => {
    const date = start + (steps ? Math.round((index * days) / steps) : 0) * DAY;
    const value =
      eligible.reduce((sum, a) => {
        const purchase = dateValue(a.purchase_date!);
        if (purchase > date) return sum;
        const ended =
          a.status === "sold"
            ? a.sold_date
            : a.status === "retired"
              ? a.retired_date
              : null;
        const end = ended ? Math.min(dateValue(ended), date) : date;
        const serviceDays = Math.max(1, Math.round((end - purchase) / DAY) + 1);
        // Preview reconstructs using today's net cost, not immutable historical snapshots.
        const daily =
          a.cost_rule === "custom" && a.custom_daily != null
            ? a.custom_daily
            : a.total_cost / serviceDays;
        return sum + Math.round(daily * 100);
      }, 0) / 100;
    return { label: new Date(date).toISOString().slice(0, 10), value };
  });
}
