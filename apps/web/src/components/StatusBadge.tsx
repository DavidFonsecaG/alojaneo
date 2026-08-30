import { Badge, type BadgeProps } from "./ui/badge";
import type {
  ReservationRoomStatus,
  ReservationSummaryStatus,
} from "../types";

type AnyStatus = ReservationRoomStatus | ReservationSummaryStatus;

const CONFIG: Record<AnyStatus, { label: string; variant: BadgeProps["variant"] }> = {
  confirmed: { label: "Confirmed", variant: "info" },
  active: { label: "Check In", variant: "success" },
  checked_in: { label: "Checked in", variant: "success" },
  checked_out: { label: "Checked out", variant: "neutral" },
  cancelled: { label: "Cancelled", variant: "danger" },
  no_show: { label: "No show", variant: "warning" },
};

export function StatusBadge({ status }: { status: AnyStatus }) {
  const cfg = CONFIG[status] ?? { label: status, variant: "neutral" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
