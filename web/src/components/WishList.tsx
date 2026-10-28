import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { AssetVisual } from "./AssetCard";
import { useStore } from "../store";
import { api } from "../api";
import type { Asset } from "../types";

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
export default function WishList() {
  const { wishes, money, reload, toast } = useStore();
  const navigate = useNavigate();
  const [order, setOrder] = useState(wishes.map((w) => w.id));
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
    if (!locked.current && !drag.current) change(wishes.map((w) => w.id));
  }, [wishes]);
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
      await api.reorderWishes(ids);
      await reload();
    } catch (e) {
      change(before);
      toast((e as Error).message);
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
  const start = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    if (locked.current || !e.isPrimary || e.button !== 0) return;
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
  const move = (e: PointerEvent<HTMLButtonElement>) => {
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
    if (e.clientY < 80) window.scrollBy(0, -14);
    else if (e.clientY > innerHeight - 100) window.scrollBy(0, 14);
    const list = root.current;
    if (!list) return;
    const bounds = list.getBoundingClientRect();
    if (e.clientX < bounds.left - 30 || e.clientX > bounds.right + 30) return;
    const slots = [...list.querySelectorAll<HTMLElement>("[data-wish-id]")].map(
      (el) => ({
        id: el.dataset.wishId!,
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
  const end = (e: PointerEvent<HTMLButtonElement>, cancel = false) => {
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
  const content = (w: Asset) => (
    <>
      <span className="wish-icon">
        <AssetVisual asset={w} />
      </span>
      <span className="wish-info">
        <span className="wish-name">{w.name}</span>
        <span className="wish-date">{w.wish_date || "未设置日期"}</span>
      </span>
      <span className="wish-price">{money(w.price)}</span>
    </>
  );
  const dragged = wishes.find((w) => w.id === ghost?.id);
  return (
    <>
      <p className="wish-sort-hint">
        {busy ? "正在保存顺序…" : "长按拖动卡片，可调整顺序"}
      </p>
      <div
        className="wish-list sortable-wishes"
        ref={root}
        aria-label="心愿清单"
      >
        {order
          .map((id) => wishes.find((w) => w.id === id))
          .filter((w): w is Asset => !!w)
          .map((w) => (
            <motion.button
              layout="position"
              transition={{ duration: 0.18 }}
              key={w.id}
              type="button"
              data-wish-id={w.id}
              className={`wish-item${ghost?.id === w.id ? " wish-drag-placeholder" : ""}`}
              aria-label={w.name}
              title="长按拖动，或使用 Alt + 方向键排序"
              disabled={busy}
              onPointerDown={(e) => start(e, w.id)}
              onPointerMove={move}
              onPointerUp={(e) => end(e)}
              onPointerCancel={(e) => end(e, true)}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => {
                if (Date.now() >= suppress.current)
                  navigate(`/asset/${w.id}`, { state: { from: "/wish" } });
              }}
              onKeyDown={(e) => {
                if (
                  !e.altKey ||
                  !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    e.key,
                  )
                )
                  return;
                e.preventDefault();
                const before = [...orderRef.current],
                  ids = [...before],
                  from = ids.indexOf(w.id),
                  to = Math.max(
                    0,
                    Math.min(
                      ids.length - 1,
                      from +
                        (["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 1),
                    ),
                  );
                ids.splice(from, 1);
                ids.splice(to, 0, w.id);
                change(ids);
                void persist(ids, before);
              }}
            >
              {content(w)}
            </motion.button>
          ))}
      </div>
      {ghost &&
        dragged &&
        createPortal(
          <div
            className="wish-item wish-drag-ghost"
            aria-hidden="true"
            style={{
              left: ghost.x,
              top: ghost.y,
              width: ghost.width,
              height: ghost.height,
            }}
          >
            {content(dragged)}
          </div>,
          document.body,
        )}
    </>
  );
}
