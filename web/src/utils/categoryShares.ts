import type { Stats } from "../types";
export function categoryShares(categories: Stats["categories"]) {
  // A sale profit is a negative net investment, not a negative pie wedge.
  const total = categories.reduce((sum, c) => sum + Math.max(0, c.value), 0);
  return {
    total,
    items: categories.map((c) => ({
      ...c,
      share: total > 0 ? Math.max(0, c.value) / total : 0,
    })),
  };
}
