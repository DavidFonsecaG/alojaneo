import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./button";
import { cn } from "../../lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /**
   * Pinned action row rendered below the scrolling body. Stays fixed while the
   * body scrolls. A submit button here can drive a `<form>` in `children` via
   * the button's `form="<id>"` attribute, since the two live in sibling DOM.
   */
  footer?: ReactNode;
  className?: string;
}

// Lightweight modal (no Radix). Renders into document.body, closes on Escape
// or backdrop click, and locks body scroll while open.
//
// Layout is a fixed-header / scrolling-body / fixed-footer shell capped at
// 85vh. The body's scroll track sits flush to the card edge (the card clips it
// with the rounded corners); the content padding lives on an inner wrapper so
// the scrollbar never floats inside a gutter.
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg",
          className,
        )}
      >
        {/* Header — fixed */}
        <div className="flex shrink-0 items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold leading-none tracking-tight">
              {title}
            </h2>
            {description && (
              <p className="mt-1.5 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — scrolls; the track is flush to the card edge, padding is
            on the inner wrapper so it never sits in a gutter. */}
        {children ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-5 py-4">{children}</div>
          </div>
        ) : null}

        {/* Footer — fixed action row below the scrolling body */}
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Delete",
  loading,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </Dialog>
  );
}
