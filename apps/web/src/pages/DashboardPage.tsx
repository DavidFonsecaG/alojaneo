import { useState, type ReactNode, type ComponentType } from "react";
import { Link } from "react-router-dom";
import {
  LogIn,
  LogOut,
  CalendarPlus,
  XCircle,
  UserX,
  CheckCircle2,
  Gauge,
  BedDouble,
  DoorOpen,
} from "lucide-react";
import { PageHeader } from "../components/Layout";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "../components/ui/button";
import { CenteredSpinner, Spinner } from "../components/ui/spinner";
import { useDashboard, useOccupancy } from "../lib/dashboard";
import { useUpdateRoomStatus } from "../lib/reservations";
import { parseApiDate, toApiDate } from "../lib/format";
import { cn } from "../lib/utils";
import type {
  DashboardArrival,
  DashboardData,
  OccupancySpan,
  ReservationRoomStatus,
} from "../types";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SPANS: OccupancySpan[] = ["day", "week", "month"];

function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(isoStr).toLocaleDateString();
}

function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl bg-card p-5 shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DashboardPage() {
  const dash = useDashboard();
  const rs = dash.data?.roomStatus;
  const occupied = rs?.occupied ?? 0;
  const available = rs?.available ?? 0;
  const total = rs?.total ?? 0;
  const pct = total ? Math.round((100 * occupied) / total) : 0;
  const arrivals = dash.data?.arrivingToday.length ?? 0;
  const loading = dash.isLoading;
  const num = (n: number) => (loading ? "–" : String(n));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Welcome back — here's what's happening today."
      />

      {/* KPI strip — today at a glance */}
      <div className="grid animate-fade-in gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Occupancy"
          value={loading ? "–" : `${pct}%`}
          icon={<Gauge className="h-5 w-5" />}
          tint="bg-primary/10 text-primary"
        />
        <Kpi
          label="In-house"
          value={num(occupied)}
          icon={<BedDouble className="h-5 w-5" />}
          tint="bg-sky-100 text-sky-600"
        />
        <Kpi
          label="Arrivals today"
          value={num(arrivals)}
          icon={<LogIn className="h-5 w-5" />}
          tint="bg-violet-100 text-violet-600"
        />
        <Kpi
          label="Available"
          value={num(available)}
          icon={<DoorOpen className="h-5 w-5" />}
          tint="bg-emerald-100 text-emerald-600"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <OccupancyCard />
        <RecentActivityCard data={dash.data} loading={dash.isLoading} />
        <ArrivingTodayCard data={dash.data} loading={dash.isLoading} />
      </div>
    </>
  );
}

// ── KPI stat card ────────────────────────────────────────────────────
function Kpi({
  label,
  value,
  icon,
  tint,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tint: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-3xl bg-card p-5 shadow-card">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      </div>
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          tint,
        )}
      >
        {icon}
      </span>
    </div>
  );
}

// ── Occupancy statistics (bar chart) ─────────────────────────────────
function OccupancyCard() {
  const [span, setSpan] = useState<OccupancySpan>("week");
  const occ = useOccupancy(span);
  const total = occ.data?.total ?? 0;
  const series = occ.data?.series ?? [];
  const isMonth = span === "month";
  // Only the single-bar "day" view needs a width cap; week/month bars fill
  // their columns so they read as a proper chart rather than thin slivers.
  const singleBar = series.length <= 1;
  const todayStr = toApiDate(new Date());

  return (
    <Panel className="lg:col-span-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Occupancy Statistics</h2>
          <p className="text-sm text-muted-foreground">
            Rooms occupied per day
          </p>
        </div>
        <div className="flex rounded-lg bg-muted p-0.5 text-sm">
          {SPANS.map((s) => (
            <button
              key={s}
              onClick={() => setSpan(s)}
              className={cn(
                "rounded-md px-3 py-1 capitalize transition-colors",
                span === s
                  ? "bg-card font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {occ.isLoading ? (
        <div className="flex h-56 items-center justify-center">
          <CenteredSpinner />
        </div>
      ) : (
        <div className="mt-6 flex h-56 items-stretch gap-1.5">
          {series.map((p) => {
            const pct = total
              ? Math.min(100, Math.round((100 * p.occupied) / total))
              : 0;
            // Give any non-zero day a visible minimum so a low-occupancy
            // bar still reads as a bar rather than an empty column.
            const barHeight = p.occupied > 0 ? Math.max(pct, 6) : 0;
            const d = parseApiDate(p.date);
            const isToday = p.date === todayStr;
            const label = isMonth ? String(d.getDate()) : WEEKDAY[d.getDay()];
            return (
              <div
                key={p.date}
                className="flex flex-1 flex-col items-center gap-1.5"
              >
                <span className="h-4 text-[11px] font-medium tabular-nums text-muted-foreground">
                  {p.occupied > 0 ? p.occupied : ""}
                </span>
                <div
                  className={cn(
                    "relative flex w-full flex-1 items-end overflow-hidden rounded-lg bg-muted",
                    singleBar && "max-w-[140px]",
                  )}
                  title={`${p.occupied}/${total} rooms · ${pct}%`}
                >
                  <div
                    className={cn(
                      "w-full rounded-lg transition-[height] duration-300",
                      isToday ? "bg-primary" : "bg-primary/70",
                    )}
                    style={{ height: `${barHeight}%` }}
                  />
                </div>
                <span
                  className={cn(
                    "h-3 text-[11px]",
                    isToday
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {isMonth ? (d.getDate() % 5 === 0 || isToday ? label : "") : label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ── Arriving today ───────────────────────────────────────────────────
function ArrivingTodayCard({
  data,
  loading,
}: {
  data?: DashboardData;
  loading: boolean;
}) {
  const rows = (data?.arrivingToday ?? []).slice(0, 6);

  return (
    <Panel className="lg:col-span-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Arriving Today</h2>
        <Link
          to="/reservations"
          className="text-sm font-medium text-blue-500 hover:underline"
        >
          View all
        </Link>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <CenteredSpinner />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          No arrivals scheduled for today.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 font-medium">Guest</th>
                <th className="py-2 font-medium">Room</th>
                <th className="py-2 font-medium">Type</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <ArrivalRow
                  key={`${r.reservation_id}-${r.room_number}`}
                  arrival={r}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function ArrivalRow({ arrival }: { arrival: DashboardArrival }) {
  const mutation = useUpdateRoomStatus(arrival.reservation_id);
  const canCheckIn = arrival.status === "confirmed";

  return (
    <tr className="border-t border-border">
      <td className="py-2.5">
        <div className="font-medium">
          {arrival.first_name} {arrival.last_name}
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {arrival.booking_ref}
        </div>
      </td>
      <td className="py-2.5">{arrival.room_number}</td>
      <td className="py-2.5 text-muted-foreground">{arrival.room_type_name}</td>
      <td className="py-2.5">
        <div className="flex items-center justify-between gap-3">
          <StatusBadge status={arrival.status} />
          {canCheckIn && (
            <Button
              size="sm"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  roomId: arrival.reservation_room_id,
                  status: "checked_in",
                })
              }
            >
              {mutation.isPending && <Spinner />}
              Check in
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Recent activity ──────────────────────────────────────────────────
interface Activity {
  key: string;
  at: string;
  icon: ComponentType<{ className?: string }>;
  iconClass: string;
  title: string;
  detail: string;
}

function statusMeta(status: ReservationRoomStatus): {
  icon: Activity["icon"];
  iconClass: string;
  title: string;
} {
  switch (status) {
    case "checked_in":
      return { icon: LogIn, iconClass: "bg-emerald-100 text-emerald-600", title: "Check-in complete" };
    case "checked_out":
      return { icon: LogOut, iconClass: "bg-slate-100 text-slate-600", title: "Check-out complete" };
    case "cancelled":
      return { icon: XCircle, iconClass: "bg-red-100 text-red-600", title: "Reservation cancelled" };
    case "no_show":
      return { icon: UserX, iconClass: "bg-amber-100 text-amber-600", title: "Guest no-show" };
    default:
      return { icon: CheckCircle2, iconClass: "bg-violet-100 text-violet-600", title: "Reservation confirmed" };
  }
}

function buildActivity(data?: DashboardData): Activity[] {
  if (!data) return [];
  const events: Activity[] = data.recentStatusEvents.map((e, i) => {
    const meta = statusMeta(e.new_status);
    return {
      key: `s${i}`,
      at: e.created_at,
      icon: meta.icon,
      iconClass: meta.iconClass,
      title: meta.title,
      detail: `Room ${e.room_number} · ${e.first_name} ${e.last_name}`,
    };
  });
  const bookings: Activity[] = data.recentBookings.map((b, i) => ({
    key: `b${i}`,
    at: b.created_at,
    icon: CalendarPlus,
    iconClass: "bg-primary/10 text-primary",
    title: "New booking",
    detail: `${b.first_name} ${b.last_name}`,
  }));
  return [...events, ...bookings]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6);
}

function RecentActivityCard({
  data,
  loading,
}: {
  data?: DashboardData;
  loading: boolean;
}) {
  const items = buildActivity(data);

  return (
    <Panel>
      <h2 className="text-lg font-semibold">Recent Activity</h2>
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <CenteredSpinner />
        </div>
      ) : items.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No recent activity.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <li key={it.key} className="flex gap-3">
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    it.iconClass,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{it.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {it.detail}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground/70">
                    {relativeTime(it.at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
