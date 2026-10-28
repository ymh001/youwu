import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import RollingNumber from "../components/RollingNumber";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  LayoutGrid,
  List,
  Package,
  Wallet,
  CalendarDays,
  CircleCheck,
  Plus,
  SlidersHorizontal,
  X,
} from "lucide-react";
import AssetCard from "../components/AssetCard";
import { useStore } from "../store";
import { useUI } from "../ui";
import type { Asset } from "../types";
import { computeScopedStats } from "../utils/stats";

const STATUS_OPTIONS = [
  { key: "all", label: "全部状态" },
  { key: "serving", label: "使用中" },
  { key: "retired", label: "已退役" },
  { key: "sold", label: "已卖出" },
] as const;
export default function Home() {
  const { assets, categories, money, loading } = useStore();
  const reduceMotion = useReducedMotion();
  const { openAdd } = useUI();
  const navigate = useNavigate();
  const [categoryId, setCategoryId] = useState("all");
  const [status, setStatus] = useState<"all" | "serving" | "retired" | "sold">(
    "all",
  );
  const [sort, setSort] = useState("created_desc");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [q, setQ] = useState("");
  const scoped = useMemo(
    () => computeScopedStats(assets, { status, categoryId, q }),
    [assets, status, categoryId, q],
  );
  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    const list = assets.filter(
      (a) =>
        (!a.parent_id ||
          !assets.some((parent) => parent.id === a.parent_id) ||
          a.show_on_home ||
          !!key) &&
        (categoryId === "all" || a.category_id === categoryId) &&
        (status === "all" || a.status === status) &&
        (!key ||
          `${a.name} ${a.notes || ""} ${a.category_name || ""}`
            .toLowerCase()
            .includes(key)),
    );
    const compare: Record<string, (a: Asset, b: Asset) => number> = {
      created_desc: (a, b) =>
        (b.created_at || "").localeCompare(a.created_at || ""),
      purchase_desc: (a, b) =>
        (b.purchase_date || "").localeCompare(a.purchase_date || ""),
      price_desc: (a, b) => b.price - a.price,
      daily_desc: (a, b) => b.daily_cost - a.daily_cost,
      duration_desc: (a, b) => b.days - a.days,
    };
    return list.sort(
      (a, b) =>
        Number(b.is_pinned) - Number(a.is_pinned) || compare[sort](a, b),
    );
  }, [assets, categoryId, status, sort, q]);
  return (
    <div className="page home-page">
      <header className="page-head">
        <div>
          <div className="eyebrow">LESS, BUT BETTER.</div>
          <h1>我的资产</h1>
          <p>让每一件拥有，都有迹可循。</p>
        </div>
        <div className="collection-count">
          <Package size={17} />
          <span>
            {assets.length} 件珍藏
            {assets.length > 0 &&
            assets.every((a) => a.notes?.startsWith("[演示资料]"))
              ? " · 演示"
              : ""}
          </span>
        </div>
      </header>
      <section className="overview" aria-label="资产总览">
        <div className="metric metric-primary">
          <div className="metric-label">
            <Wallet size={17} />
            <span>资产总值</span>
          </div>
          <strong>
            <RollingNumber text={money(scoped.totalValue)} />
          </strong>
          <span className="metric-decoration" aria-hidden="true" />
        </div>
        <div className="metric">
          <div className="metric-label">
            <CalendarDays size={17} />
            <span>日均成本</span>
          </div>
          <strong>
            <RollingNumber text={money(scoped.totalDaily)} />
            <small>/天</small>
          </strong>
        </div>
        <div className="metric">
          <div className="metric-label">
            <CircleCheck size={17} />
            <span>正在使用</span>
          </div>
          <strong>
            <RollingNumber text={String(scoped.counts.serving)} />
            <small>件</small>
          </strong>
          <span className="metric-caption">
            已退役 <RollingNumber text={String(scoped.counts.retired)} /> ·
            已卖出 <RollingNumber text={String(scoped.counts.sold)} />
          </span>
        </div>
      </section>
      <section className="collection" aria-label="资产收藏">
        <div className="collection-toolbar">
          <div className="collection-title">
            <h2>物品收藏</h2>
            <span>{filtered.length}</span>
          </div>
          <div className="collection-tools">
            <label className="search-box">
              <Search size={17} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索"
                aria-label="搜索资产"
              />
              {q && (
                <button aria-label="清空搜索" onClick={() => setQ("")}>
                  <X size={14} />
                </button>
              )}
            </label>
            <div className="view-toggle" aria-label="视图">
              <button
                className={view === "grid" ? "active" : ""}
                onClick={() => setView("grid")}
                aria-label="网格视图"
                aria-pressed={view === "grid"}
              >
                <LayoutGrid size={17} />
              </button>
              <button
                className={view === "list" ? "active" : ""}
                onClick={() => setView("list")}
                aria-label="列表视图"
                aria-pressed={view === "list"}
              >
                <List size={18} />
              </button>
            </div>
          </div>
        </div>
        <div className="filter-row">
          <div className="chips category-chips">
            <button
              className={`chip${categoryId === "all" ? " active" : ""}`}
              onClick={() => setCategoryId("all")}
            >
              全部物品
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                className={`chip${categoryId === c.id ? " active" : ""}`}
                onClick={() => setCategoryId(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="filter-selects">
            <SlidersHorizontal size={14} />
            <select
              aria-label="资产状态"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option value={o.key} key={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
            <span />
            <select
              aria-label="排序"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="created_desc">最近添加</option>
              <option value="purchase_desc">购买时间</option>
              <option value="price_desc">价格最高</option>
              <option value="daily_desc">日均最高</option>
              <option value="duration_desc">持有最久</option>
            </select>
          </div>
        </div>
        {loading ? (
          <div className="asset-grid">
            {Array.from({ length: 6 }, (_, i) => (
              <div className="asset-skeleton" key={i}>
                <div />
                <span />
                <span />
              </div>
            ))}
          </div>
        ) : (
          <div className={`asset-grid ${view}`}>
            <AnimatePresence initial={false} mode="popLayout">
              {filtered.length === 0 ? (
                <motion.div
                  key="empty"
                  className="empty"
                  style={{ gridColumn: "1 / -1" }}
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0 } }}
                  transition={{ duration: reduceMotion ? 0 : 0.16 }}
                >
                  <span className="empty-icon">
                    <Package size={36} strokeWidth={1.2} />
                  </span>
                  <h3>
                    {assets.length
                      ? "没有找到这件物品"
                      : "从第一件喜欢的物品开始"}
                  </h3>
                  <p>
                    {assets.length
                      ? "试试其他关键词，或调整筛选条件。"
                      : "一张照片，一个名字，开启你的资产记录。"}
                  </p>
                  {assets.length ? (
                    <button
                      className="btn ghost"
                      onClick={() => {
                        setQ("");
                        setCategoryId("all");
                        setStatus("all");
                      }}
                    >
                      清除筛选
                    </button>
                  ) : (
                    <button
                      className="btn primary"
                      onClick={() => openAdd("asset")}
                    >
                      <Plus size={16} />
                      添加第一件资产
                    </button>
                  )}
                </motion.div>
              ) : (
                filtered.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    money={money}
                    view={view}
                    onClick={() =>
                      navigate(`/asset/${asset.id}`, { state: { from: "/" } })
                    }
                  />
                ))
              )}
            </AnimatePresence>
          </div>
        )}
      </section>
      <footer className="footer-note">
        <span className="footer-line" />
        拥有恰好，生活刚好。
        <span className="footer-line" />
      </footer>
    </div>
  );
}
