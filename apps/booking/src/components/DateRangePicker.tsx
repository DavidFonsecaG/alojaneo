import { useEffect, useRef, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { CalendarDays } from "lucide-react";
import "react-day-picker/style.css";
import { parseApiDate, toApiDate } from "../lib/format";
import { cn } from "../lib/utils";

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);

// A single "Select dates" control that opens a range calendar — replaces the
// two native <input type="date"> boxes. Range endpoints/hover pick up the
// hotel accent via the --rdp-* variables set in index.css.
export function DateRangePicker({
  checkIn,
  checkOut,
  minDate,
  onChange,
}: {
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  minDate?: Date;
  onChange: (checkIn: string, checkOut: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [months, setMonths] = useState(1);
  const ref = useRef<HTMLDivElement>(null);

  // Two months on wider screens, one on narrow.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const apply = () => setMonths(mq.matches ? 2 : 1);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected: DateRange | undefined = checkIn
    ? {
        from: parseApiDate(checkIn),
        to: checkOut ? parseApiDate(checkOut) : undefined,
      }
    : undefined;

  function handleSelect(range: DateRange | undefined, triggerDate: Date) {
    // Booking pattern: when a full range is already set, the next click starts
    // a fresh check-in rather than extending the old range.
    if (checkIn && checkOut && triggerDate) {
      onChange(toApiDate(triggerDate), "");
      return;
    }
    if (!range?.from) {
      onChange("", "");
      return;
    }
    onChange(toApiDate(range.from), range.to ? toApiDate(range.to) : "");
    // Once both ends are chosen, close the popover.
    if (range.from && range.to) setOpen(false);
  }

  const label = checkIn
    ? `${fmt(parseApiDate(checkIn))}${
        checkOut ? ` → ${fmt(parseApiDate(checkOut))}` : " → …"
      }`
    : "Select dates";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", !checkIn && "text-muted-foreground")}>
          {label}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 max-w-[calc(100vw-2rem)] overflow-x-auto rounded-2xl border border-border bg-card p-2 shadow-lg">
          <DayPicker
            mode="range"
            numberOfMonths={months}
            defaultMonth={checkIn ? parseApiDate(checkIn) : minDate}
            selected={selected}
            onSelect={handleSelect}
            disabled={minDate ? { before: minDate } : undefined}
            weekStartsOn={1}
          />
        </div>
      )}
    </div>
  );
}
