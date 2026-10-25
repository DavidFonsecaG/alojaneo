import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  ChevronsUpDown,
  ExternalLink,
  LogOut,
  Settings,
  UserCog,
  Users,
} from "lucide-react";
import { Dropdown, MenuItem, MenuSeparator } from "./ui/dropdown";
import { UserSettingsModal } from "./UserSettingsModal";
import { useAuth } from "../lib/auth";
import { useMe } from "../lib/setup";
import { useDashboard } from "../lib/dashboard";
import { useUiPrefs } from "../lib/prefs";
import { cn } from "../lib/utils";
import type { DashboardData } from "../types";

const BOOKING_URL = import.meta.env.VITE_BOOKING_URL || "http://localhost:5174";

function initials(email: string): string {
  const local = (email.split("@")[0] || "").replace(/[^a-zA-Z0-9]/g, "");
  return (local.slice(0, 2) || "U").toUpperCase();
}

function prettyRole(role?: string): string {
  if (role === "admin") return "Admin";
  if (role === "general") return "Staff";
  return role ? role[0].toUpperCase() + role.slice(1) : "Member";
}

// ── Account menu ─────────────────────────────────────────────────────
export function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth();
  const me = useMe();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isAdmin = user?.role === "admin";
  const email = me.data?.email ?? "";
  const avatar = email ? initials(email) : "··";

  return (
    <>
    <Dropdown
      width={collapsed ? 240 : "trigger"}
      triggerClassName={collapsed ? "" : "w-full"}
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label="Account menu"
          className={cn(
            "flex h-11 items-center gap-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-neutral-200",
            collapsed ? "w-11 justify-center px-0" : "w-full px-2",
            open && "bg-neutral-200",
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {avatar}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium leading-tight">
                  {me.data?.hotelName || "Your hotel"}
                </span>
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {prettyRole(user?.role)}
                </span>
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="px-2.5 py-2">
            <div className="truncate text-sm font-medium">
              {me.data?.hotelName || "Your hotel"}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {email || prettyRole(user?.role)}
            </div>
          </div>
          <MenuSeparator />
          <MenuItem
            icon={<UserCog className="h-4 w-4" />}
            onClick={() => {
              close();
              setSettingsOpen(true);
            }}
          >
            Account settings
          </MenuItem>
          {me.data?.hotelSlug && (
            <MenuItem
              icon={<ExternalLink className="h-4 w-4" />}
              onClick={() => {
                window.open(
                  `${BOOKING_URL}/${me.data!.hotelSlug}`,
                  "_blank",
                  "noopener",
                );
                close();
              }}
            >
              View booking page
            </MenuItem>
          )}
          {isAdmin && (
            <>
              <MenuItem
                icon={<Settings className="h-4 w-4" />}
                onClick={() => {
                  navigate("/settings");
                  close();
                }}
              >
                Settings
              </MenuItem>
              <MenuItem
                icon={<Users className="h-4 w-4" />}
                onClick={() => {
                  navigate("/settings#users");
                  close();
                }}
              >
                Users &amp; permissions
              </MenuItem>
            </>
          )}
          <MenuSeparator />
          <MenuItem
            icon={<LogOut className="h-4 w-4" />}
            danger
            onClick={() => {
              close();
              logout();
            }}
          >
            Sign out
          </MenuItem>
        </>
      )}
    </Dropdown>
    <UserSettingsModal
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
    />
    </>
  );
}

// ── Notifications ────────────────────────────────────────────────────
const SEEN_KEY = "alojaneo.notifSeenAt";

interface Notice {
  key: string;
  at: string;
  dot: string;
  title: string;
  detail: string;
}

function buildNotices(data?: DashboardData): Notice[] {
  if (!data) return [];
  const status = data.recentStatusEvents.map((e, i) => {
    const map: Record<string, { dot: string; title: string }> = {
      checked_in: { dot: "bg-emerald-500", title: "Checked in" },
      checked_out: { dot: "bg-slate-400", title: "Checked out" },
      cancelled: { dot: "bg-red-500", title: "Reservation cancelled" },
      no_show: { dot: "bg-amber-500", title: "Guest no-show" },
      confirmed: { dot: "bg-blue-500", title: "Reservation confirmed" },
    };
    const m = map[e.new_status] ?? { dot: "bg-slate-400", title: "Update" };
    return {
      key: `s${i}`,
      at: e.created_at,
      dot: m.dot,
      title: m.title,
      detail: `Room ${e.room_number} · ${e.first_name} ${e.last_name}`,
    };
  });
  const bookings = data.recentBookings.map((b, i) => ({
    key: `b${i}`,
    at: b.created_at,
    dot: "bg-violet-500",
    title: "New booking",
    detail: `${b.first_name} ${b.last_name}`,
  }));
  return [...status, ...bookings]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 12);
}

function relTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationsBell({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const dash = useDashboard();
  const prefs = useUiPrefs();
  const notices = useMemo(() => buildNotices(dash.data), [dash.data]);
  const [seenAt, setSeenAt] = useState<number>(() => {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? Number(raw) : 0;
  });
  const unreadCount = notices.filter(
    (n) => new Date(n.at).getTime() > seenAt,
  ).length;
  // The badge is a per-browser preference; hide the count when it's off.
  const unread = prefs.notifBadge ? unreadCount : 0;

  function markSeen() {
    const now = Date.now();
    setSeenAt(now);
    try {
      localStorage.setItem(SEEN_KEY, String(now));
    } catch {
      /* ignore */
    }
  }

  return (
    <Dropdown
      width={320}
      align={collapsed ? "left" : "right"}
      trigger={({ toggle, open }) => (
        <button
          type="button"
          aria-label={unread ? `Notifications (${unread} new)` : "Notifications"}
          onClick={() => {
            if (!open) markSeen();
            toggle();
          }}
          className={cn(
            "relative flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-neutral-200 hover:text-foreground",
            open && "bg-neutral-200 text-foreground",
          )}
        >
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex min-w-[15px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-[15px] text-primary-foreground ring-2 ring-background">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}
    >
      {() => (
        <>
          <div className="flex items-center justify-between px-2.5 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            <span className="text-xs text-muted-foreground">
              {notices.length} recent
            </span>
          </div>
          <MenuSeparator />
          {notices.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
              <Bell className="h-6 w-6 text-muted-foreground/60" />
              <p className="text-sm font-medium">You're all caught up</p>
              <p className="text-xs text-muted-foreground">
                New bookings and check-ins show up here.
              </p>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              {notices.map((n) => (
                <div
                  key={n.key}
                  className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 hover:bg-accent"
                >
                  <span
                    className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.dot)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">
                      {n.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {n.detail}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground/70">
                    {relTime(n.at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Dropdown>
  );
}
