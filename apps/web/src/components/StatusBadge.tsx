import { cn } from "../lib/utils";
import type {
  ReservationRoomStatus,
  ReservationSummaryStatus,
} from "../types";

type AnyStatus = ReservationRoomStatus | ReservationSummaryStatus;

// Semantic status chips: a leading dot for quick scanning, a soft tinted
// background and a hairline ring. Status hues are intentionally not themed —
// they stay consistent regardless of the hotel's accent.
const CONFIG: Record<AnyStatus, { label: string; dot: string; pill: string }> = {
  confirmed: {
    label: "Confirmed",
    dot: "bg-blue-500",
    pill: "bg-blue-50 text-blue-700 ring-blue-600/10",
  },
  active: {
    label: "Check In",
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
  },
  checked_in: {
    label: "Checked in",
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
  },
  checked_out: {
    label: "Checked out",
    dot: "bg-slate-400",
    pill: "bg-slate-100 text-slate-600 ring-slate-500/10",
  },
  cancelled: {
    label: "Cancelled",
    dot: "bg-red-500",
    pill: "bg-red-50 text-red-700 ring-red-600/10",
  },
  no_show: {
    label: "No show",
    dot: "bg-amber-500",
    pill: "bg-amber-50 text-amber-700 ring-amber-600/10",
  },
};

export function StatusBadge({ status }: { status: AnyStatus }) {
  const cfg =
    CONFIG[status] ??
    ({ label: status, dot: "bg-slate-400", pill: "bg-slate-100 text-slate-600 ring-slate-500/10" } as const);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        cfg.pill,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}
