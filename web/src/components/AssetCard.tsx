import TargetProgress from "./TargetProgress";
import { forwardRef, useState } from "react";
import { motion, useReducedMotion, useIsPresent } from "motion/react";
import { Pin, Package, ArrowUpRight } from "lucide-react";
import type { Asset } from "../types";

export const STATUS_LABEL: Record<string, string> = {
  serving: "使用中",
  retired: "已退役",
  sold: "已卖出",
};
export function tintColor(asset: Asset): string {
  return `${asset.category_color || "#007aff"}12`;
}
export function AssetVisual({
  asset,
  className = "",
}: {
  asset: Pick<Asset, "image_url" | "name" | "icon">;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return asset.image_url && failed !== asset.image_url ? (
    <img
      className={`asset-photo ${className}`}
      src={asset.image_url}
      alt={asset.name}
      loading="lazy"
      onError={() => setFailed(asset.image_url)}
    />
  ) : (
    <span className={`asset-placeholder ${className}`}>
      <span aria-hidden="true">{asset.icon || <Package />}</span>
      {asset.image_url && failed === asset.image_url && (
        <small>图片加载失败</small>
      )}
    </span>
  );
}
interface Props {
  asset: Asset;
  money: (v: number) => string;
  onClick: () => void;
  view?: "grid" | "list";
}
const AssetCard = forwardRef<HTMLButtonElement, Props>(function AssetCard(
  { asset, money, onClick, view = "grid" },
  ref,
) {
  const reduceMotion = useReducedMotion();
  const isPresent = useIsPresent();
  const unit = asset.cost_rule === "per_use" ? "/次" : "/天";
  return (
    <motion.button
      ref={ref}
      data-asset-id={asset.id}
      data-present={isPresent}
      aria-hidden={!isPresent || undefined}
      tabIndex={isPresent ? 0 : -1}
      style={{ pointerEvents: isPresent ? "auto" : "none" }}
      layout={reduceMotion ? false : "position"}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.1 } }}
      transition={{
        opacity: { duration: reduceMotion ? 0 : 0.16, ease: "easeOut" },
        layout: {
          duration: reduceMotion ? 0 : 0.18,
          ease: [0.22, 0.61, 0.36, 1],
        },
      }}
      className={`asset-card ${view}`}
      onClick={isPresent ? onClick : undefined}
    >
      <div className="asset-thumb">
        <AssetVisual asset={asset} />
        {(asset.status === "sold" || asset.status === "retired") && (
          <img
            className="asset-watermark"
            src={asset.status === "sold" ? "/watermarks/sold.svg" : "/watermarks/retired.svg"}
            alt={asset.status === "sold" ? "卖掉了" : "退役了"}
            draggable={false}
          />
        )}
        {asset.status === "serving" && (
          <span className="asset-serving-dot" role="img" aria-label="使用中" />
        )}
        {asset.is_pinned && (
          <span className="pin-dot" title="置顶">
            <Pin size={13} />
          </span>
        )}
      </div>
      <div className="asset-body">
        <div className="asset-category">
          {asset.category_name || "未分类"}
          <ArrowUpRight size={14} />
        </div>
        <div className="asset-name">{asset.name}</div>
        <div className="asset-meta">
          <span>{money(asset.combined_cost ?? asset.total_cost)}</span>
          <span>已陪伴 {asset.days} 天</span>
        </div>
        <div className="asset-bottom">
          <span>{asset.cost_rule === "per_use" ? "次均成本" : "日均成本"}</span>
          <div className={`asset-cost${asset.daily_cost < 0 ? " profit" : ""}`}>
            {money(asset.combined_daily ?? asset.daily_cost)}
            <small>{unit}</small>
          </div>
        </div>
        <TargetProgress asset={asset} />
      </div>
    </motion.button>
  );
});
export default AssetCard;
