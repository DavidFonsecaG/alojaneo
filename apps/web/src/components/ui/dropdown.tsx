import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

// A small popover menu that opens upward from its trigger. Rendered in a portal
// so it's never clipped by the sidebar's overflow, and closes on outside-click
// or Escape. `trigger` renders the button; `children` renders the menu and
// receives a `close` callback for its items.
export function Dropdown({
  trigger,
  children,
  triggerClassName,
  width = 264,
  align = "left",
}: {
  trigger: (args: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  triggerClassName?: string;
  // A number, or "trigger" to match the trigger's width (fills the sidebar).
  width?: number | "trigger";
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const w = width === "trigger" ? r.width : width;
    const rawLeft = align === "right" ? r.right - w : r.left;
    const left = Math.max(8, Math.min(rawLeft, window.innerWidth - w - 8));
    // Open upward from triggers low on screen (e.g. the sidebar footer),
    // downward from triggers up top (e.g. a top bar).
    const openUp = r.top > window.innerHeight * 0.55;
    setCoords(
      openUp
        ? { left, width: w, bottom: window.innerHeight - r.top + 8 }
        : { left, width: w, top: r.bottom + 8 },
    );
  }, [open, align, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <div ref={triggerRef} className={triggerClassName}>
        {trigger({ open, toggle: () => setOpen((o) => !o) })}
      </div>
      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              left: coords.left,
              ...(coords.top != null
                ? { top: coords.top }
                : { bottom: coords.bottom }),
              width: coords.width,
            }}
            className="z-50 animate-fade-in rounded-xl bg-card p-1 shadow-xl ring-1 ring-black/10"
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent",
        danger ? "text-destructive" : "text-foreground",
      )}
    >
      {icon && (
        <span
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center",
            !danger && "text-muted-foreground",
          )}
        >
          {icon}
        </span>
      )}
      <span className="truncate">{children}</span>
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-border" />;
}
