import { useCallback, useEffect, useState } from "react";
import { Trash2, RotateCcw } from "lucide-react";
import { api } from "../api";
import { useStore } from "../store";
import { AssetVisual, STATUS_LABEL } from "./AssetCard";

type TrashData = Awaited<ReturnType<typeof api.trash>>;
const DAY = 86400000;
export default function RecycleBin() {
  const { reload, toast, money } = useStore();
  const [data, setData] = useState<TrashData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const result = await api.trash();
    setData(result);
    setError("");
  }, []);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  const run = async (action: () => Promise<unknown>, message: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await Promise.all([load(), reload()]);
      toast(message);
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const changeRetention = (value: string) => {
    const days = value === "never" ? null : (Number(value) as 7 | 30 | 180);
    if (!data || days === data.retention_days) return;
    const expired =
      days === null
        ? 0
        : data.items.filter(
            (item) => Date.now() - Date.parse(item.deleted_at) >= days * DAY,
          ).length;
    if (
      expired &&
      !window.confirm(
        `有 ${expired} 条记录已超过 ${days} 天，修改后将立即永久删除，是否继续？`,
      )
    )
      return;
    void run(() => api.setTrashRetention(days), "已更新自动清空期限");
  };
  return (
    <div className="recycle-bin">
      <section className="card">
        <label className="field">
          <span>自动清空</span>
          <select
            aria-label="自动清空期限"
            value={data ? (data.retention_days ?? "never") : 180}
            disabled={busy || !data}
            onChange={(e) => changeRetention(e.target.value)}
          >
            <option value="7">7 天</option>
            <option value="30">30 天</option>
            <option value="180">180 天</option>
            <option value="never">不自动清空</option>
          </select>
        </label>
        <p className="hint">
          从移入回收站之日起计时，到期后永久删除。备份不包含回收站记录。
        </p>
      </section>
      {error && (
        <div className="recycle-error" role="alert">
          {error}
          <button
            className="link"
            onClick={() => load().catch((e) => setError(e.message))}
          >
            重新加载
          </button>
        </div>
      )}
      {!data ? (
        <p className="muted">正在加载回收站…</p>
      ) : (
        <>
          <div className="recycle-toolbar">
            <span>{data.items.length} 条记录</span>
            <button
              className="link danger"
              disabled={busy || !data.items.length}
              onClick={() => {
                if (
                  window.confirm(
                    `确定永久删除回收站中的 ${data.items.length} 条记录？此操作无法撤销。`,
                  )
                )
                  void run(() => api.emptyTrash(), "回收站已清空");
              }}
            >
              清空回收站
            </button>
          </div>
          {data.items.length === 0 && (
            <div className="empty">
              <Trash2 size={28} />
              <h3>回收站是空的</h3>
              <p>删除的资产和心愿会暂存在这里。</p>
            </div>
          )}
          <div className="recycle-list">
            {data.items.map((item) => (
              <article className="card recycle-item" key={item.id}>
                <div className="recycle-item-main">
                  <div className="recycle-image">
                    <AssetVisual asset={item} />
                  </div>
                  <div className="recycle-info">
                    <h3>{item.name}</h3>
                    <p>
                      {item.type === "wish"
                        ? "心愿"
                        : STATUS_LABEL[item.status]}{" "}
                      · {item.category_name || "未分类"} · {money(item.price)}
                    </p>
                    <p>
                      删除于{" "}
                      {new Date(item.deleted_at).toLocaleString("zh-CN", {
                        hour12: false,
                      })}
                    </p>
                    <p>
                      {data.retention_days === null
                        ? "保留直到手动删除"
                        : `${Math.max(0, Math.ceil((Date.parse(item.deleted_at) + data.retention_days * DAY - Date.now()) / DAY))} 天后自动清空`}
                    </p>
                  </div>
                </div>
                <details className="recycle-details">
                  <summary>查看记录</summary>
                  <p>
                    {item.type === "wish" ? "心愿日期" : "购买日期"}：
                    {item.purchase_date || item.wish_date || "未填写"}
                  </p>
                  {item.sold_date && (
                    <p>
                      卖出：{money(item.sold_price || 0)} · {item.sold_date}
                    </p>
                  )}
                  {item.retired_date && <p>退役日期：{item.retired_date}</p>}
                  {item.tags.length > 0 && (
                    <p>标签：{item.tags.map((t) => t.name).join(" · ")}</p>
                  )}
                  {item.notes && (
                    <p className="recycle-notes">备注：{item.notes}</p>
                  )}
                </details>
                <div className="recycle-actions">
                  <button
                    className="btn ghost small"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => api.restoreAsset(item.id),
                        "已还原到原来的资产或心愿列表",
                      )
                    }
                  >
                    <RotateCcw size={13} />
                    还原
                  </button>
                  <button
                    className="btn ghost small danger"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `确定永久删除「${item.name}」？此操作无法撤销。`,
                        )
                      )
                        void run(
                          () => api.deletePermanently(item.id),
                          "已永久删除",
                        );
                    }}
                  >
                    <Trash2 size={13} />
                    永久删除
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
