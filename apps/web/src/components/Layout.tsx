import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  BedDouble,
  Users,
  Sparkles,
  CreditCard,
  Settings,
  ClipboardList,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/utils";
import { AccountMenu, NotificationsBell } from "./SidebarAccount";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, enabled: true },
  { to: "/timeline", label: "Calendar", icon: CalendarDays, enabled: true },
  { to: "/reservations", label: "Reservations", icon: ClipboardList, enabled: true },
  { to: "/rooms", label: "Rooms", icon: BedDouble, enabled: true },
  { to: "/guests", label: "Guests", icon: Users, enabled: true },
  { to: "/payments", label: "Payments", icon: CreditCard, enabled: true },
  { to: "/housekeeping", label: "Housekeeping", icon: Sparkles, enabled: true },
  { to: "/settings", label: "Settings", icon: Settings, enabled: true, adminOnly: true },
];

export function Layout() {
  const { user } = useAuth();

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("alojaneo.sidebar") === "collapsed",
  );
  const toggleSidebar = () =>
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("alojaneo.sidebar", next ? "collapsed" : "expanded");
      return next;
    });

  return (
    // Everything floats as cards on a single soft-gray canvas.
    <div className="flex h-screen bg-[#f4f4f4]">
      <aside
        className={cn(
          "flex shrink-0 flex-col overflow-hidden transition-[width] duration-200 ease-in-out",
          collapsed ? "w-16" : "w-52",
        )}
      >
        {/* Brand — the logo stays pinned left; the wordmark fades out. */}
        <div className="flex h-16 items-center px-3">
          <Link to="/" className="flex items-center gap-2.5 overflow-hidden">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
            </span>
            <span
              className={cn(
                "whitespace-nowrap text-lg font-semibold transition-opacity duration-200",
                collapsed && "opacity-0",
              )}
            >
              Alojaneo
            </span>
          </Link>
        </div>

        {/* Collapse/expand toggle — pinned at the top so it's always visible,
            left-aligned on the same column as the nav icons. */}
        <div className="px-3 pb-1">
          <button
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-9 w-full items-center gap-3 overflow-hidden whitespace-nowrap rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4 shrink-0" />
            ) : (
              <PanelLeftClose className="h-4 w-4 shrink-0" />
            )}
            <span
              className={cn(
                "transition-opacity duration-200",
                collapsed && "opacity-0",
              )}
            >
              Collapse
            </span>
          </button>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto p-3 pt-2">
          {NAV.filter(
            (item) => !item.adminOnly || user?.role === "admin",
          ).map((item) => {
            const Icon = item.icon;
            // Icon stays pinned left (fixed px-3) in both states; only the
            // label fades + the sidebar width animates, so nothing jumps.
            const base =
              "flex h-11 items-center gap-3 overflow-hidden whitespace-nowrap rounded-xl px-3 text-sm font-medium transition-colors";
            const label = (
              <span
                className={cn(
                  "transition-opacity duration-200",
                  collapsed && "opacity-0",
                )}
              >
                {item.label}
              </span>
            );
            if (!item.enabled) {
              return (
                <div
                  key={item.to}
                  className={cn(base, "cursor-not-allowed text-muted-foreground/50")}
                  title={collapsed ? `${item.label} (coming soon)` : "Coming soon"}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </div>
              );
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    base,
                    isActive
                      ? "bg-card text-primary shadow"
                      : "text-muted-foreground hover:text-primary",
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3">
          <AccountMenu collapsed={collapsed} />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar — notifications live top-right, the conventional spot. */}
        <header className="flex h-12 shrink-0 items-center justify-end px-3">
          <NotificationsBell />
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-3 pb-3">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    // Header sits directly on the canvas (no card), matching the Timeline page.
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
