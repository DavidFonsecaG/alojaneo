import { useState, type ReactNode, type ComponentType } from "react";
import { Link } from "react-router-dom";
import {
  LogIn,
  LogOut,
  CalendarPlus,
  XCircle,
  UserX,
  CheckCircle2,
} from "lucide-react";
import { PageHeader } from "../components/Layout";
import { StatusBadge } from "../components/StatusBadge";
import { CenteredSpinner } from "../components/ui/spinner";
import { useDashboard, useOccupancy } from "../lib/dashboard";
import { parseApiDate } from "../lib/format";
import { cn } from "../lib/utils";
import type {
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
    <div className={cn("rounded-2xl bg-card p-5 shadow-sm", className)}>
      {children}
    </div>
  );
}

export function DashboardPage() {
  const dash = useDashboard();

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Welcome back — here's what's happening today."
      />
      <div className="grid gap-3 lg:grid-cols-3">
        <OccupancyCard />
        <RoomStatusCard data={dash.data} loading={dash.isLoading} />
        <ArrivingTodayCard data={dash.data} loading={dash.isLoading} />
        <RecentActivityCard data={dash.data} loading={dash.isLoading} />
      </div>
    </>
  );
}

// ── Occupancy statistics (bar chart) ─────────────────────────────────
function OccupancyCard() {
  const [span, setSpan] = useState<OccupancySpan>("week");
  const occ = useOccupancy(span);
  const total = occ.data?.total ?? 0;
  const series = occ.data?.series ?? [];
  const isMonth = span === "month";

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
        <div className="mt-6 flex h-56 items-stretch gap-2">
          {series.map((p) => {
            const pct = total
              ? Math.min(100, Math.round((100 * p.occupied) / total))
              : 0;
            const d = parseApiDate(p.date);
            const label = isMonth ? String(d.getDate()) : WEEKDAY[d.getDay()];
            return (
              <div
                key={p.date}
                className="flex flex-1 flex-col items-center gap-2"
              >
                <div
                  className={cn(
                    "relative flex w-full flex-1 items-end overflow-hidden rounded-lg bg-primary/10",
                    !isMonth && "max-w-[52px]",
                  )}
                  title={`${p.occupied}/${total} rooms · ${pct}%`}
                >
                  <div
                    className="w-full rounded-lg bg-primary transition-[height] duration-300"
                    style={{ height: `${pct}%` }}
                  />
                </div>
                <span className="h-3 text-[11px] text-muted-foreground">
                  {isMonth ? (d.getDate() % 5 === 0 ? label : "") : label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ── Room status (donut) ──────────────────────────────────────────────
function RoomStatusCard({
  data,
  loading,
}: {
  data?: DashboardData;
  loading: boolean;
}) {
  const rs = data?.roomStatus;
  const total = rs?.total ?? 0;
  const occupied = rs?.occupied ?? 0;
  const available = rs?.available ?? 0;
  const pct = total ? Math.round((100 * occupied) / total) : 0;

  const R = 52;
  const C = 2 * Math.PI * R;
  const occLen = (pct / 100) * C;

  return (
    <Panel>
      <h2 className="text-lg font-semibold">Room Status</h2>
      {loading ? (
        <div className="flex h-56 items-center justify-center">
          <CenteredSpinner />
        </div>
      ) : (
        <>
          <div className="relative mx-auto mt-4 flex h-44 w-44 items-center justify-center">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
              <circle
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="14"
                strokeDasharray={`${occLen} ${C}`}
              />
              <circle
                cx="60"
                cy="60"
                r={R}
                fill="none"
                className="text-emerald-400"
                stroke="currentColor"
                strokeWidth="14"
                strokeDasharray={`${C - occLen} ${C}`}
                strokeDashoffset={-occLen}
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-3xl font-bold">{pct}%</span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Occupied
              </span>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-around text-sm">
            <div className="flex flex-col items-center gap-1">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-primary" />
                Occupied
              </span>
              <span className="font-semibold">{occupied} Rooms</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Available
              </span>
              <span className="font-semibold">{available} Rooms</span>
            </div>
          </div>
        </>
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
    <Panel className="lg:col-span-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Arriving Today</h2>
        <Link
          to="/reservations"
          className="text-sm font-medium text-primary hover:underline"
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
                <tr
                  key={`${r.reservation_id}-${r.room_number}`}
                  className="border-t border-border"
                >
                  <td className="py-2.5">
                    <div className="font-medium">
                      {r.first_name} {r.last_name}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {r.booking_ref}
                    </div>
                  </td>
                  <td className="py-2.5">{r.room_number}</td>
                  <td className="py-2.5 text-muted-foreground">
                    {r.room_type_name}
                  </td>
                  <td className="py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
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
      return { icon: CheckCircle2, iconClass: "bg-blue-100 text-blue-600", title: "Reservation confirmed" };
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
