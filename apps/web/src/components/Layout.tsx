import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  BedDouble,
  Users,
  Tags,
  Sparkles,
  Settings,
  LogOut,
  ClipboardList,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, enabled: true },
  { to: "/timeline", label: "Calendar", icon: CalendarDays, enabled: true },
  { to: "/reservations", label: "Reservations", icon: ClipboardList, enabled: true },
  { to: "/rooms", label: "Rooms", icon: BedDouble, enabled: true },
  { to: "/rate-plans", label: "Rate plans", icon: Tags, enabled: true },
  { to: "/guests", label: "Guests", icon: Users, enabled: true },
  { to: "/housekeeping", label: "Housekeeping", icon: Sparkles, enabled: false },
  { to: "/settings", label: "Settings", icon: Settings, enabled: false },
];

export function Layout() {
  const { user, logout } = useAuth();

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("hrs.sidebar") === "collapsed",
  );
  const toggleSidebar = () =>
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("hrs.sidebar", next ? "collapsed" : "expanded");
      return next;
    });

  return (
    // Everything floats as cards on a single soft-gray canvas.
    <div className="flex h-screen bg-[#f4f4f4]">
      <aside
        className={cn(
          "flex shrink-0 flex-col overflow-hidden rounded-3xl shadow-sm transition-[width] duration-200 ease-in-out",
          collapsed ? "w-[76px]" : "w-52",
        )}
      >
        <div
          className={cn(
            "relative flex h-16 items-center px-4",
            collapsed ? "justify-center" : "gap-2",
          )}
        >
          <Link to="/" className="flex items-center gap-2 mt-3">
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
            {!collapsed && <span className="text-lg font-semibold">Hospeda</span>}
          </Link>
          <button
            onClick={toggleSidebar}
            className={cn(
              "absolute right-2 top-12 rounded-full p-1 text-muted-foreground transition-colors bg-card shadow hover:text-primary",
              !collapsed && "ml-auto",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? (
              <ChevronsRight className="h-3 w-3" />
            ) : (
              <ChevronsLeft className="h-3 w-3" />
            )}
          </button>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto p-3 pt-5">
          {NAV.map((item) => {
            const Icon = item.icon;
            // Same height in both states; when collapsed each item is a
            // square that shows only its icon.
            const shape = collapsed
              ? "mx-auto h-10 w-10 justify-center"
              : "h-11 gap-4 px-3";
            const base = cn(
              "flex items-center rounded-xl text-sm font-medium transition-colors",
              shape,
            );
            if (!item.enabled) {
              return (
                <div
                  key={item.to}
                  className={cn(base, "cursor-not-allowed text-muted-foreground/50")}
                  title={collapsed ? `${item.label} (coming soon)` : "Coming soon"}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <>
                      <span>{item.label}</span>
                    </>
                  )}
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
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div
          className={cn(
            "border-t border-border p-3",
            collapsed && "flex justify-center",
          )}
        >
          {!collapsed && (
            <div className="mb-2 px-2 text-xs text-muted-foreground">
              Signed in as{" "}
              <span className="font-medium capitalize text-foreground">
                {user?.role}
              </span>
            </div>
          )}
          <button
            onClick={logout}
            title="Log out"
            aria-label="Log out"
            className={cn(
              "flex items-center rounded-lg text-[15px] font-medium text-foreground transition-colors hover:bg-accent",
              collapsed ? "h-11 w-11 justify-center" : "h-11 w-full gap-3 px-3",
            )}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {!collapsed && "Log out"}
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto pr-3 py-3">
        <Outlet />
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
