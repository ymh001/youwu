import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { useStore } from "../store";
import { GripVertical } from "lucide-react";

type Drag = {
  id: string;
  pointer: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
  height: number;
  active: boolean;
  before: string[];
  mouse: boolean;
};
type Item = { id: string; name: string; color?: string };
export default function SortableManagementList({
  items,
  label,
  onReorder,
  onRename,
  onDelete,
}: {
  items: Item[];
  label: string;
  onReorder: (ids: string[]) => Promise<void>;
  onRename: (item: Item) => void;
  onDelete: (item: Item) => void;
}) {
  const { reload } = useStore();
  const [order, setOrder] = useState(items.map((w) => w.id));
  const orderRef = useRef(order);
  const [ghost, setGhost] = useState<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const suppress = useRef(0);
  const change = (ids: string[]) => {
    orderRef.current = ids;
    setOrder(ids);
  };
  useEffect(() => {
    if (!locked.current && !drag.current) change(items.map((w) => w.id));
  }, [items, busy]);
  useEffect(() => {
    const node = root.current;
    const stop = (e: TouchEvent) => {
      if (drag.current?.active && e.cancelable) e.preventDefault();
    };
    node?.addEventListener("touchmove", stop, { passive: false });
    return () => {
      clearTimeout(timer.current);
      node?.removeEventListener("touchmove", stop);
    };
  }, []);
  const persist = async (ids: string[], before: string[]) => {
    if (ids.join() === before.join()) return;
    locked.current = true;
    setBusy(true);
    try {
      await onReorder(ids);
    } catch (e) {
      change(before);
      await reload().catch(() => {});
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const lift = (g: Drag) => {
    g.active = true;
    setGhost({
      id: g.id,
      x: g.x - g.dx,
      y: g.y - g.dy,
      width: g.width,
      height: g.height,
    });
  };
  const start = (e: PointerEvent<HTMLDivElement>, id: string) => {
    if (
      locked.current ||
      !e.isPrimary ||
      e.button !== 0 ||
      (e.target as Element).closest("[data-manage-action]")
    )
      return;
    const r = e.currentTarget.getBoundingClientRect();
    const g: Drag = {
      id,
      pointer: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
      width: r.width,
      height: r.height,
      active: false,
      before: [...orderRef.current],
      mouse: e.pointerType === "mouse",
    };
    drag.current = g;
    e.currentTarget.setPointerCapture(e.pointerId);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (drag.current === g) lift(g);
    }, 400);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g || e.pointerId !== g.pointer) return;
    if (!g.active) {
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < 8) return;
      clearTimeout(timer.current);
      if (g.mouse) lift(g);
      else {
        drag.current = null;
        return;
      }
    }
    e.preventDefault();
    setGhost({
      id: g.id,
      x: e.clientX - g.dx,
      y: e.clientY - g.dy,
      width: g.width,
      height: g.height,
    });
    const scroller = root.current?.closest(".form-body");
    if (scroller) {
      const r = scroller.getBoundingClientRect();
      if (e.clientY < r.top + 40) scroller.scrollBy(0, -14);
      else if (e.clientY > r.bottom - 40) scroller.scrollBy(0, 14);
    }
    const list = root.current;
    if (!list) return;
    const bounds = list.getBoundingClientRect();
    if (e.clientX < bounds.left - 30 || e.clientX > bounds.right + 30) return;
    const slots = [...list.querySelectorAll<HTMLElement>("[data-sort-id]")].map(
      (el) => ({
        id: el.dataset.sortId!,
        x: bounds.left + el.offsetLeft + el.offsetWidth / 2,
        y: bounds.top + el.offsetTop + el.offsetHeight / 2,
      }),
    );
    const nearest = slots.sort(
      (a, b) =>
        Math.hypot(a.x - e.clientX, a.y - e.clientY) -
        Math.hypot(b.x - e.clientX, b.y - e.clientY),
    )[0];
    const ids = [...orderRef.current],
      from = ids.indexOf(g.id),
      to = ids.indexOf(nearest?.id || "");
    if (from < 0 || to < 0 || from === to) return;
    ids.splice(from, 1);
    ids.splice(to, 0, g.id);
    change(ids);
  };
  const end = (e: PointerEvent<HTMLDivElement>, cancel = false) => {
    const g = drag.current;
    clearTimeout(timer.current);
    drag.current = null;
    setGhost(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (!g) return;
    if (g.active) {
      suppress.current = Date.now() + 450;
      e.preventDefault();
    }
    if (cancel) change(g.before);
    else if (g.active) void persist([...orderRef.current], g.before);
  };
  const dragged = items.find((item) => item.id === ghost?.id);
  return (
    <>
      <p className="management-sort-hint">
        {busy ? "正在保存顺序…" : "拖动可排序，手机长按后拖动"}
      </p>
      <div
        className="sortable-management"
        ref={root}
        aria-label={`${label}排序`}
        onClickCapture={(e) => {
          if (Date.now() < suppress.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {order
          .map((id) => items.find((item) => item.id === id))
          .filter((item): item is Item => !!item)
          .map((item) => (
            <motion.div
              layout="position"
              transition={{ duration: 0.18 }}
              className={`manage-row sortable-manage-row${ghost?.id === item.id ? " management-placeholder" : ""}`}
              key={item.id}
              data-sort-id={item.id}
              onPointerDown={(e) => start(e, item.id)}
              onPointerMove={move}
              onPointerUp={(e) => end(e)}
              onPointerCancel={(e) => end(e, true)}
              onContextMenu={(e) => {
                if (!(e.target as Element).closest("[data-manage-action]"))
                  e.preventDefault();
              }}
            >
              <button
                type="button"
                className="manage-drag-handle"
                disabled={busy}
                aria-label={`拖动${label}「${item.name}」排序`}
                title="拖动排序，或使用 Alt + 方向键"
                onKeyDown={(e) => {
                  if (!e.altKey || !["ArrowUp", "ArrowDown"].includes(e.key))
                    return;
                  e.preventDefault();
                  const before = [...orderRef.current],
                    ids = [...before],
                    from = ids.indexOf(item.id),
                    to = Math.max(
                      0,
                      Math.min(
                        ids.length - 1,
                        from + (e.key === "ArrowUp" ? -1 : 1),
                      ),
                    );
                  ids.splice(from, 1);
                  ids.splice(to, 0, item.id);
                  change(ids);
                  void persist(ids, before);
                }}
              >
                <GripVertical size={16} />
                <span>
                  {label === "标签" && (
                    <i className="dot" style={{ background: item.color }} />
                  )}
                  {item.name}
                </span>
              </button>
              <button
                type="button"
                className="link"
                data-manage-action
                disabled={busy}
                onClick={() => onRename(item)}
              >
                重命名
              </button>
              <button
                type="button"
                className="link danger"
                data-manage-action
                disabled={busy}
                onClick={() => onDelete(item)}
              >
                删除
              </button>
            </motion.div>
          ))}
      </div>
      {ghost &&
        dragged &&
        createPortal(
          <div
            className="manage-row management-ghost"
            aria-hidden="true"
            style={{
              left: ghost.x,
              top: ghost.y,
              width: ghost.width,
              height: ghost.height,
            }}
          >
            <GripVertical size={16} />
            <span className="manage-name">{dragged.name}</span>
            <span className="link">重命名</span>
            <span className="link danger">删除</span>
          </div>,
          document.body,
        )}
    </>
  );
}
