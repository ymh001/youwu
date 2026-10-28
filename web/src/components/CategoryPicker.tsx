import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { useStore } from "../store";

export default function CategoryPicker({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { categories, deleteCategory, reorderCategories, reload, toast } =
    useStore();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState(categories.map((c) => c.id));
  const [dragging, setDragging] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    name: string;
  } | null>(null);
  const orderRef = useRef(order);
  const latestCategories = useRef(categories);
  latestCategories.current = categories;
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const gesture = useRef<{
    id: string;
    pointer: number;
    x: number;
    y: number;
    active: boolean;
    before: string[];
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
    name: string;
  } | null>(null);
  const locked = useRef(false);
  const suppressClickUntil = useRef(0);
  const changeOrder = (ids: string[]) => {
    orderRef.current = ids;
    setOrder(ids);
  };
  const clearTimer = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
  };
  useEffect(() => {
    if (!locked.current && !gesture.current) {
      const ids = categories.map((c) => c.id);
      orderRef.current = ids;
      setOrder(ids);
    }
  }, [categories]);
  useEffect(() => {
    const element = root.current;
    // Keep ordinary swipe scrolling until long-press has actually lifted a chip.
    const preventDragScroll = (event: TouchEvent) => {
      if (gesture.current?.active && event.cancelable) event.preventDefault();
    };
    element?.addEventListener("touchmove", preventDragScroll, { passive: false });
    return () => { clearTimeout(timer.current); element?.removeEventListener("touchmove", preventDragScroll); };
  }, []);

  const persist = async (ids: string[], before: string[]) => {
    if (ids.join() === before.join()) return;
    locked.current = true;
    setBusy(true);
    try {
      await reorderCategories(ids);
    } catch {
      await reload().catch(() => {});
    } finally {
      changeOrder(latestCategories.current.map((c) => c.id));
      locked.current = false;
      setBusy(false);
    }
  };
  const start = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (locked.current || !event.isPrimary || event.button !== 0) return;
    clearTimer();
    const bounds = event.currentTarget.getBoundingClientRect();
    const g = {
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
      width: bounds.width,
      height: bounds.height,
      name: event.currentTarget.textContent || "",
      id,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      active: editing,
      before: [...orderRef.current],
    };
    gesture.current = g;
    event.currentTarget.setPointerCapture(event.pointerId);
    const lift = () => {
      setDragging(id);
      setGhost({
        x: g.x - g.offsetX,
        y: g.y - g.offsetY,
        width: g.width,
        height: g.height,
        name: g.name,
      });
    };
    if (editing) lift();
    else
      timer.current = setTimeout(() => {
        if (gesture.current === g) {
          g.active = true;
          setEditing(true);
          lift();
        }
      }, 450);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g || g.pointer !== event.pointerId) return;
    if (!g.active) {
      if (Math.hypot(event.clientX - g.x, event.clientY - g.y) > 8) {
        clearTimer();
        gesture.current = null;
      }
      return;
    }
    event.preventDefault();
    setGhost({
      x: event.clientX - g.offsetX,
      y: event.clientY - g.offsetY,
      width: g.width,
      height: g.height,
      name: g.name,
    });
    const scroller = root.current?.closest(".form-body");
    if (scroller) {
      const bounds = scroller.getBoundingClientRect();
      if (event.clientY < bounds.top + 36) scroller.scrollBy(0, -12);
      else if (event.clientY > bounds.bottom - 36) scroller.scrollBy(0, 12);
    }
    const list = root.current?.querySelector<HTMLElement>(".category-options");
    if (!list) return;
    const bounds = list.getBoundingClientRect();
    if (
      event.clientX < bounds.left - 20 ||
      event.clientX > bounds.right + 20 ||
      event.clientY < bounds.top - 20 ||
      event.clientY > bounds.bottom + 20
    )
      return;
    // Use layout coordinates rather than animated transforms for stable insertion slots.
    const slots = Array.from(
      list.querySelectorAll<HTMLElement>("[data-category-id]"),
    ).map((el) => ({
      id: el.dataset.categoryId!,
      x: bounds.left + el.offsetLeft + el.offsetWidth / 2,
      y: bounds.top + el.offsetTop + el.offsetHeight / 2,
    }));
    const target = slots.sort(
      (a, b) =>
        Math.hypot(a.x - event.clientX, a.y - event.clientY) -
        Math.hypot(b.x - event.clientX, b.y - event.clientY),
    )[0];
    const ids = [...orderRef.current];
    const from = ids.indexOf(g.id);
    const to = ids.indexOf(target?.id || "");
    if (from < 0 || to < 0 || from === to) return;
    ids.splice(from, 1);
    ids.splice(to, 0, g.id);
    changeOrder(ids);
  };
  const end = (event: PointerEvent<HTMLButtonElement>, cancel = false) => {
    const g = gesture.current;
    clearTimer();
    gesture.current = null;
    setDragging(null);
    setGhost(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (!g) return;
    if (g.active) {
      suppressClickUntil.current = Date.now() + 400;
      event.preventDefault();
    }
    if (cancel) changeOrder(g.before);
    else if (g.active) void persist([...orderRef.current], g.before);
  };
  const remove = async (id: string, name: string) => {
    if (
      locked.current ||
      !window.confirm(
        `确定删除分类「${name}」？该分类下的资产会变为未分类，资产本身不会被删除。`,
      )
    )
      return;
    locked.current = true;
    setBusy(true);
    try {
      await deleteCategory(id);
      if (selectedId === id) onSelect("");
      toast("分类已删除");
    } catch {
      /* Store displays errors. */
    } finally {
      changeOrder(latestCategories.current.map((c) => c.id));
      locked.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <div
        ref={root}
        className={`category-picker${editing ? " is-editing" : ""}`}
        onClickCapture={(event) => {
          if (Date.now() < suppressClickUntil.current) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        aria-busy={busy}
      >
        <div className="category-edit-toolbar">
          <span aria-live="polite">
            {busy
              ? "正在保存…"
              : editing
                ? "按住拖动排序，点击 × 删除"
                : "长按分类可编辑"}
          </span>
          <button
            type="button"
            className="link"
            disabled={busy || !!dragging}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "完成" : "编辑"}
          </button>
        </div>
        <div className="chips wrap category-options">
          <button
            type="button"
            className={`chip${!selectedId ? " active" : ""}`}
            disabled={editing || busy}
            onClick={() => onSelect("")}
          >
            未分类
          </button>
          {order.map((id) => {
            const category = categories.find((c) => c.id === id);
            if (!category) return null;
            return (
              <motion.div
                layout="position"
                transition={{ duration: 0.18, ease: "easeOut" }}
                key={id}
                data-category-id={id}
                className={`category-token${dragging === id ? " dragging" : ""}`}
              >
                <button
                  type="button"
                  className={`chip${selectedId === id ? " active" : ""}`}
                  disabled={busy}
                  aria-pressed={selectedId === id}
                  aria-label={
                    editing
                      ? `${category.name}，按住拖动排序，也可用左右方向键移动`
                      : category.name
                  }
                  onPointerDown={(e) => start(e, id)}
                  onPointerMove={move}
                  onPointerUp={(e) => end(e)}
                  onPointerCancel={(e) => end(e, true)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!busy) setEditing(true);
                  }}
                  onClick={() => {
                    if (!editing) onSelect(id);
                  }}
                  onKeyDown={(e) => {
                    if (
                      !editing ||
                      locked.current ||
                      !["ArrowLeft", "ArrowRight"].includes(e.key)
                    )
                      return;
                    e.preventDefault();
                    const before = [...orderRef.current];
                    const index = before.indexOf(id);
                    const to = index + (e.key === "ArrowLeft" ? -1 : 1);
                    if (to < 0 || to >= before.length) return;
                    const next = [...before];
                    next.splice(index, 1);
                    next.splice(to, 0, id);
                    changeOrder(next);
                    void persist(next, before);
                  }}
                >
                  {category.name}
                </button>
                {editing && (
                  <button
                    type="button"
                    className="category-delete"
                    aria-label={`删除分类 ${category.name}`}
                    disabled={busy || !!dragging}
                    onClick={() => void remove(id, category.name)}
                  >
                    <X size={10} strokeWidth={2.5} />
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
      {ghost &&
        createPortal(
          <div
            aria-hidden="true"
            className="chip category-drag-overlay"
            style={{
              left: 0,
              top: 0,
              width: ghost.width,
              height: ghost.height,
              transform: `translate3d(${ghost.x}px, ${ghost.y}px, 0)`,
            }}
          >
            {ghost.name}
          </div>,
          document.body,
        )}
    </>
  );
}
