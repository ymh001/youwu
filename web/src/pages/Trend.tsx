import { useState } from "react";
import TrendBoard, { TrendWidget } from "../components/TrendBoard";
import { Donut } from "../components/Charts";
import { CashFlowView, GoalsView, HoldingsView } from "../components/TrendViews";
import CategoryPie from "../components/CategoryPie";
import { useStore } from "../store";
import {
  RANGE_OPTIONS,
  type RangeKey,
} from "../utils/stats";

export default function Trend() {
  const { trends, trendsError, retryTrends, money } = useStore();
  const [ascending, setAscending] = useState(false);
  const [range, setRange] = useState<RangeKey>("all");
  if (!trends) return <div className="page trend-page">
    <header className="page-head"><h1>数据趋势</h1></header>
    <div className="card trend-loading" role="status" aria-live="polite">
      <p>{trendsError ? '暂时无法载入趋势' : '正在整理趋势…'}</p>
      {trendsError && <button type="button" className="btn ghost" onClick={retryTrends}>重试</button>}
    </div>
  </div>;
  const scoped = trends.ranges[range];
  const stats = scoped.stats;
  const ranking = ascending ? scoped.ranking.ascending : scoped.ranking.descending;
  const segs = [
    { value: stats.byStatus.serving, color: "#007aff" },
    { value: stats.byStatus.retired, color: "#F59E0B" },
    { value: stats.byStatus.sold, color: "#94A3B8" },
  ];

  return (
    <div className="page trend-page">
      <header className="page-head">
        <div>
          <div className="eyebrow">TIME TELLS THE VALUE.</div>
          <h1>数据趋势</h1>
          <p>时间流过，价值慢慢浮现。</p>
        </div>
      </header>

      <div className="chips">
        {RANGE_OPTIONS.map((r) => (
          <button
            key={r.key}
            className={`chip${range === r.key ? " active" : ""}`}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <TrendBoard>
        <TrendWidget id="cash" title="投入与回收" size="tall"><CashFlowView data={scoped.cash} range={range} money={money} /></TrendWidget>
        <TrendWidget id="holdings" title="持有数量变化"><HoldingsView data={scoped.holdings} /></TrendWidget>
        <TrendWidget id="goals" title="目标达成概览"><GoalsView data={trends.goals} /></TrendWidget>
        <TrendWidget id="status" title="资产状态"><section className="card widget-card">
          <div className="card-title">
            资产状态<span className="muted small">区间内购入</span>
          </div>
          {stats.count === 0 ? (
            <div className="muted">暂无数据</div>
          ) : (
            <div className="donut-wrap">
              <Donut segments={segs} />
              <div className="donut-legend">
                {(
                  [
                    [
                      "服役中",
                      stats.byStatus.serving,
                      stats.statusValue.serving,
                      "#007aff",
                    ],
                    [
                      "已退役",
                      stats.byStatus.retired,
                      stats.statusValue.retired,
                      "#F59E0B",
                    ],
                    [
                      "已卖出",
                      stats.byStatus.sold,
                      stats.statusValue.sold,
                      "#94A3B8",
                    ],
                  ] as const
                ).map(([label, count, value, color]) => (
                  <div key={label} className="legend-row">
                    <i className="dot" style={{ background: color }} />
                    <span>{label}</span>
                    <b>{count}</b>
                    <em>{money(value)}</em>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section></TrendWidget>

        <TrendWidget id="category" title="分类占比" size="tall"><section className="card widget-card">
          <div className="card-title">
            分类占比<span className="muted small">净投入金额</span>
          </div>
          <CategoryPie categories={stats.categories} money={money} />
        </section></TrendWidget>

        <TrendWidget id="ranking" title="日均排行"><section className="card widget-card">
          <div className="card-title">
            <span>日均排行</span>
            <button type="button" className="link small" aria-label="切换日均排行顺序" onClick={() => setAscending(v => !v)}>{ascending ? "从低到高 ↑" : "从高到低 ↓"}</button>
          </div>
          <div className="trend-ranking-list">{ranking.map((a, i) => (
            <div key={a.id} className="rank-row">
              <span className={`rank-index r${i + 1}`}>{i + 1}</span>
              <span className="rank-name">
                {a.icon} {a.name}
              </span>
              <span className="rank-cost">{money(a.daily_cost)}/天</span>
            </div>
          ))}
          {ranking.length === 0 && <div className="muted">暂无数据</div>}</div>
        </section></TrendWidget>
      </TrendBoard>
    </div>
  );
}
