import AccessorySection from "../components/AccessorySection";
import {
  ArrowLeft,
  MoreHorizontal,
  Pencil,
  Copy,
  Download,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { assetReturnPath } from "../utils/assetNavigation";
import DailyChart from "../components/DailyChart";
import Dialog from "../components/Dialog";
import { api } from "../api";
import TargetProgress from "../components/TargetProgress";
import { amountInput } from "../utils/amountInput";
import { targetProgress } from "../utils/target";
import ImageViewer from "../components/ImageViewer";
import { STATUS_LABEL, AssetVisual } from "../components/AssetCard";
import { useStore } from "../store";
import { useUI } from "../ui";
import { localToday } from "../utils/date";
import type { Asset } from "../types";

function curve(asset: Asset): {label:string;value:number}[] {
  if (!asset.purchase_date || asset.cost_rule !== "per_day") return [];
  const total = Math.max(1, asset.days);
  const base = asset.combined_cost ?? asset.total_cost ?? asset.price;
  const start = Date.parse(asset.purchase_date.slice(0,10) + "T00:00:00Z");
  return Array.from({length:total},(_, i)=>({label:new Date(start+i*86400000).toISOString().slice(0,10),value:base/(i+1)}));
}

export default function Detail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    assets,
    reload,
    wishes,
    money,
    setStatus,
    deleteAsset,
    useAsset,
    toast,
  } = useStore();
  const { openEdit, openCopy, openConvertWish } = useUI();
  const asset = useMemo(
    () => [...assets, ...wishes].find((a) => a.id === id),
    [assets, wishes, id],
  );
  const returnPath = assetReturnPath(asset, location.state?.from, [...assets,...wishes].map(a=>a.id));
  const [deleting, setDeleting] = useState(false);
  const remove = async () => {
    if(!asset || deleting || !window.confirm('确定将此资产移入回收站？可在设置的回收站中还原。'))return;
    setDeleting(true);
    try {await deleteAsset(asset.id);toast('已移入回收站');navigate(returnPath,{replace:true});}
    catch { /* The store displays the error; remain on this detail. */ }
    finally {setDeleting(false);}
  };
  const [menuOpen, setMenuOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [addingTarget, setAddingTarget] = useState(false);
  useEffect(() => setImageOpen(false), [id]);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);
  const [statusAction, setStatusAction] = useState<"sold" | "retired" | null>(
    null,
  );
  const [statusDate, setStatusDate] = useState(localToday());
  const [savingStatus, setSavingStatus] = useState(false);
  const [sellPrice, setSellPrice] = useState("");

  if (!asset) {
    return (
      <div className="page">
        <header className="detail-head">
          <button className="round-btn" onClick={() => navigate(returnPath,{replace:true})}>
            <ArrowLeft size={18} />
          </button>
        </header>
        <div className="empty">资产不存在或已删除</div>
      </div>
    );
  }

  const points = curve(asset);
  const isWish = asset.type === "wish";

  const openStatus = (action: "sold" | "retired") => {
    setStatusAction(action);
    setStatusDate(localToday());
    setSellPrice("");
  };
  const saveStatus = async () => {
    if (!statusAction || savingStatus) return;
    const price = Number(sellPrice);
    if (
      statusAction === "sold" &&
      (!sellPrice.trim() || !Number.isFinite(price) || price < 0)
    ) {
      toast("请填写有效的卖出价格");
      return;
    }
    if (
      !statusDate ||
      statusDate > localToday() ||
      (asset.purchase_date && statusDate < asset.purchase_date)
    ) {
      toast("日期不能早于购买日期或晚于今天");
      return;
    }
    setSavingStatus(true);
    try {
      await setStatus(
        asset.id,
        statusAction,
        statusAction === "sold"
          ? { sold_price: price, sold_date: statusDate }
          : { retired_date: statusDate },
      );
      setStatusAction(null);
      toast(statusAction === "sold" ? "已标记为卖出" : "已退役");
    } catch {
      /* Store displays the error. */
    } finally {
      setSavingStatus(false);
    }
  };

  return (
    <div className="page detail">
      {imageOpen && asset.image_url && <ImageViewer src={asset.image_url} name={asset.name} onClose={()=>setImageOpen(false)}/>}
      <header className="detail-head">
        <button
          className="round-btn"
          onClick={() => navigate(returnPath,{replace:true})}
          aria-label="返回"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="detail-head-actions" ref={menuRef}>
          <button
            className="round-btn"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="资产操作"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal size={20} />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                className="action-menu"
                initial={{ opacity: 0, y: -5, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -5 }}
              >
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    openEdit(asset.id);
                  }}
                >
                  <Pencil size={15} />
                  编辑
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    openCopy(asset.id);
                  }}
                >
                  <Copy size={15} />
                  复制
                </button>
                {asset.image_url?.match(
                  /^\/media\/([a-f0-9]{32})\/display.png$/,
                ) && (
                  <a
                    href={`/api/images/${asset.image_url.split("/")[2]}/original`}
                    download
                  >
                    <Download size={15} />
                    下载原图
                  </a>
                )}
                <button
                  className="danger"
                  disabled={deleting}
                  onClick={remove}
                >
                  <Trash2 size={15} />
                  删除
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>
      <div className="detail-columns"><aside className="detail-sidebar">
      <div className="detail-hero">
        {asset.image_url ? <button type="button" className="detail-icon detail-image-button" aria-label={`放大查看${asset.name}的图片`} onClick={()=>setImageOpen(true)}>
          <AssetVisual asset={asset} />
        </button> : <div className="detail-icon"><AssetVisual asset={asset} /></div>}
        <h2>{asset.name}</h2>
        {isWish ? (
          <div className="detail-daily wish">心愿价 {money(asset.price)}</div>
        ) : (
          <div
            className={`detail-daily${asset.daily_cost < 0 ? " profit" : ""}`}
          >
            {money(asset.combined_daily ?? asset.daily_cost)}
            <small>{asset.cost_rule === "per_use" ? "/次" : "/天"}</small>
          </div>
        )}
        <div className="detail-meta">
          {isWish ? (
            <span>心愿 · {asset.wish_date || "未设置日期"}</span>
          ) : (
            <>
              <span>净成本 {money(asset.combined_cost ?? asset.total_cost)}</span>
              <i />
              <span>已服役 {asset.days} 天</span>
              <span className={`status-badge inline ${asset.status}`}>
                {STATUS_LABEL[asset.status]}
              </span>
            </>
          )}
        </div>
      </div>

      {(asset.notes || asset.attachments?.length > 0) && (
        <section className="card note-card">
          <div className="card-title">备注</div>
          <p>{asset.notes}</p>
          <div className="attachment-list">{asset.attachments?.map(f=><div key={f.id}><a href={f.url} download>{f.name}</a><span className="muted">{Math.ceil(f.size/1024)} KB</span></div>)}</div>
        </section>
      )}
      {asset.legacy_data && <section className="card legacy-card"><details><summary>旧平台原始资料</summary><p className="muted small">保留未映射字段，便于核对提醒、目标及历史配置。</p><button className="btn ghost small" onClick={()=>{const href=URL.createObjectURL(new Blob([asset.legacy_data!],{type:'application/json'}));const a=document.createElement('a');a.href=href;a.download='legacy-record.json';a.click();setTimeout(()=>URL.revokeObjectURL(href),60000);}}>下载原始资料</button></details></section>}
      </aside><div className="detail-main">
      {!isWish && points.length > 0 && (
        <section className="card chart-card">
          <div className="card-title">
            <span>日均成本</span>
            <span className="muted small">按持有时间摊分净成本</span>
          </div>
          <DailyChart points={points} />
          <p className="hint">
            {asset.status === "sold"
              ? "按净成本（买入价 − 卖出价）与服役天数推算"
              : "按当前价格与服役天数推算；修改价格会重算整条曲线"}
          </p>
        </section>
      )}

      {!isWish && targetProgress(asset) && <section className="card target-card">
        <div className="card-title">{asset.target_mode==='custom'?'数量目标':'目标日均'}</div>
        <TargetProgress asset={asset}/>
        {asset.target_mode==='custom'&&asset.status==='serving'&&<button className="btn ghost small" disabled={addingTarget} onClick={async()=>{setAddingTarget(true);try{await api.incrementTarget(asset.id);await reload();}catch(e){toast((e as Error).message);}finally{setAddingTarget(false);}}}>增加 {asset.target_step} {asset.target_unit}</button>}
      </section>}

      <section className="card info-card">
        <Row label="价格" value={money(asset.price)} />
        <Row label="分类" value={asset.category_name || "未分类"} />
        <Row
          label={isWish ? "心愿日期" : "购买日期"}
          value={asset.purchase_date || asset.wish_date || "—"}
        />
        {!isWish && (
          <Row
            label="成本规则"
            value={
              asset.cost_rule === "per_day"
                ? "按天"
                : asset.cost_rule === "per_use"
                  ? "按次"
                  : "自定义"
            }
          />
        )}
        {asset.cost_rule === "per_use" && (
          <Row label="使用次数" value={`${asset.used_count} 次`} />
        )}
        {asset.tags.length > 0 && (
          <Row label="标签" value={asset.tags.map((t) => t.name).join(" · ")} />
        )}
        {!isWish && asset.status === "sold" && (
          <>
            <Row
              label="卖出"
              value={`${money(asset.sold_price ?? 0)} · ${asset.sold_date ?? ""}`}
            />
            <Row
              label="保值率"
              value={`${(((asset.sold_price ?? 0) / (asset.price || 1)) * 100).toFixed(1)}%`}
            />
            <Row
              label="净结果"
              value={
                asset.total_cost <= 0
                  ? `净赚 ${money(Math.abs(asset.total_cost))}`
                  : `净成本 ${money(asset.total_cost)}`
              }
            />
          </>
        )}
        {!isWish && asset.status === "retired" && (
          <Row label="退役日期" value={asset.retired_date ?? "—"} />
        )}
      </section>

      {!isWish && <AccessorySection asset={asset} />}



      </div></div>
      <section className="detail-actions">
        {isWish ? (
          <button
            className="btn primary block"
            onClick={() => openConvertWish(asset.id)}
          >
            转为资产
          </button>
        ) : (
          <>
            {asset.status === "serving" && (
              <>
                <button
                  className="btn ghost block"
                  onClick={() => openStatus("sold")}
                >
                  卖出
                </button>
                <button
                  className="btn ghost block"
                  onClick={() => openStatus("retired")}
                >
                  退役
                </button>
              </>
            )}
            {asset.status !== "serving" && (
              <button
                className="btn ghost block"
                onClick={async () => {
                  await setStatus(asset.id, "serving", {});
                  toast("已恢复服役");
                }}
              >
                恢复服役
              </button>
            )}
            {asset.cost_rule === "per_use" && (
              <button
                className="btn ghost block"
                onClick={async () => {
                  await useAsset(asset.id);
                  toast("使用次数 +1");
                }}
              >
                使用 +1
              </button>
            )}
          </>
        )}
        <button
          className="btn danger block"
          disabled={deleting}
          onClick={remove}
        >
          删除
        </button>
      </section>

      {statusAction && (
        <Dialog
          title={statusAction === "sold" ? "卖出资产" : "退役资产"}
          onClose={() => {
            if (!savingStatus) setStatusAction(null);
          }}
          footer={
            <>
              <button
                className="btn ghost"
                disabled={savingStatus}
                onClick={() => setStatusAction(null)}
              >
                取消
              </button>
              <button
                className="btn primary"
                disabled={
                  savingStatus ||
                  !statusDate ||
                  (statusAction === "sold" && !sellPrice.trim())
                }
                onClick={saveStatus}
              >
                {savingStatus
                  ? "保存中…"
                  : statusAction === "sold"
                    ? "确认卖出"
                    : "确认退役"}
              </button>
            </>
          }
        >
          {statusAction === "sold" && (
            <label className="field">
              <span>卖出价格</span>
              <input
                aria-label="卖出价格"
                autoFocus
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                onBlur={() => setSellPrice(amountInput(sellPrice))}
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder="0.00"
                disabled={savingStatus}
              />
            </label>
          )}
          <label className="field">
            <span>{statusAction === "sold" ? "卖出日期" : "退役日期"}</span>
            <input
              aria-label={statusAction === "sold" ? "卖出日期" : "退役日期"}
              type="date"
              value={statusDate}
              min={asset.purchase_date || undefined}
              max={localToday()}
              onChange={(e) => setStatusDate(e.target.value)}
              disabled={savingStatus}
            />
          </label>
        </Dialog>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
