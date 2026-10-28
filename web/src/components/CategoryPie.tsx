import { useState } from "react";
import type { Stats } from "../types";
import { categoryShares } from "../utils/categoryShares";
const colors = [
  "#4285f4",
  "#45af9c",
  "#a281d1",
  "#e5ad55",
  "#e47785",
  "#68a8c7",
  "#8894b7",
  "#ba956f",
  "#92b75b",
  "#b879a9",
  "#586ec3",
  "#d48d65",
  "#5a9899",
  "#9e91ca",
  "#b8a04e",
  "#ca7385",
  "#759bc0",
  "#83a893",
  "#ad8a78",
  "#8293a4",
];
const pct = (n: number) =>
  n > 0 && n < 0.001 ? "<0.1%" : `${(n * 100).toFixed(1)}%`;
function wedge(start: number, share: number) {
  const radius = 91;
  const point = (angle: number) => [
    100 + radius * Math.cos(angle),
    100 + radius * Math.sin(angle),
  ];
  const [x, y] = point(start),
    [ex, ey] = point(start + share * Math.PI * 2);
  if (share >= 1 - 1e-10)
    return "M 100 9 A 91 91 0 1 1 100 191 A 91 91 0 1 1 100 9 Z";
  return `M 100 100 L ${x} ${y} A 91 91 0 ${share > 0.5 ? 1 : 0} 1 ${ex} ${ey} Z`;
}
export default function CategoryPie({
  categories,
  money,
}: {
  categories: Stats["categories"];
  money: (n: number) => string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const { total, items } = categoryShares(categories);
  const active =
    items.find((c) => c.id === selected) || items.find((c) => c.share > 0);
  let angle = -Math.PI / 2;
  if (!items.length) return <div className="muted">暂无分类数据</div>;
  return (
    <>
      <div className="category-pie-layout">
        <div className="category-pie-visual">
          {total > 0 ? (
            <svg
              viewBox="0 0 200 200"
              className="category-pie"
              role="group"
              aria-label="分类净投入金额占比饼图"
            >
              {items.map((c, i) => {
                const d = wedge(angle, c.share);
                angle += c.share * Math.PI * 2;
                if (c.share <= 0) return null;
                return (
                  <path
                    key={c.id}
                    d={d}
                    fill={colors[i % colors.length]}
                    stroke="var(--card)"
                    strokeWidth="1.5"
                    role="button"
                    tabIndex={0}
                    aria-label={`${c.name}，${pct(c.share)}，${money(c.value)}`}
                    aria-pressed={active?.id === c.id}
                    className={active?.id === c.id ? "selected" : ""}
                    onMouseEnter={() => setSelected(c.id)}
                    onFocus={() => setSelected(c.id)}
                    onClick={() => setSelected(c.id)}
                    onKeyDown={(e) => {
                      if (["Enter", " "].includes(e.key)) {
                        e.preventDefault();
                        setSelected(c.id);
                      }
                    }}
                  >
                    <title>
                      {c.name} · {pct(c.share)}
                    </title>
                  </path>
                );
              })}
            </svg>
          ) : (
            <div className="category-pie-empty">暂无正净投入</div>
          )}
          {active && (
            <div className="category-pie-detail" aria-live="polite">
              <strong>{active.name}</strong>
              <span>
                {money(active.value)} · {active.value < 0 ? "不计入占比" : pct(active.share)}
              </span>
            </div>
          )}
        </div>
        <div className="category-pie-legend">
          {items.map((c, i) => (
            <button
              key={c.id}
              className={`category-pie-row${active?.id === c.id ? " selected" : ""}`}
              onClick={() => setSelected(c.id)}
              aria-pressed={active?.id === c.id}
            >
              <i style={{ background: colors[i % colors.length] }} />
              <span className="category-pie-name">
                {c.name}
                <small>
                  {c.count} 件 · {money(c.value)}
                </small>
              </span>
              <span className="category-pie-percent">
                {c.value < 0 ? "—" : pct(c.share)}
              </span>
            </button>
          ))}
        </div>
      </div>
      {items.some((c) => c.value < 0) && (
        <p className="trend-caption">
          按分类净投入金额统计；收益类（负值）单独列出，不计入饼图。
        </p>
      )}
    </>
  );
}
