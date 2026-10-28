import type { ReactNode } from "react";
import { useModal } from "../hooks/useModal";

export default function Dialog({
  title,
  children,
  onClose,
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const ref = useModal(onClose);
  return (
    <div className="dialog-mask" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-title">{title}</div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">
          {footer ?? (
            <button className="btn ghost" onClick={onClose}>
              关闭
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
