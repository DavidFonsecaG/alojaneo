import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarRange,
  BedDouble,
  Users,
  Tags,
  Sparkles,
  Settings,
  LogOut,
  ClipboardList,
  Hotel,
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
  { to: "/timeline", label: "Timeline", icon: CalendarRange, enabled: true },
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
    <div className="flex h-screen gap-3 bg-[#f4f4f4] p-3">
      <aside
        className={cn(
          "flex shrink-0 flex-col overflow-hidden rounded-2xl bg-card shadow-sm transition-[width] duration-200 ease-in-out",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        <div
          className={cn(
            "flex h-16 items-center px-4",
            collapsed ? "justify-center" : "gap-2",
          )}
        >
          {!collapsed && (
            <>
              <Hotel className="h-6 w-6 shrink-0 text-primary" />
              <span className="text-lg font-semibold">HRS</span>
            </>
          )}
          <button
            onClick={toggleSidebar}
            className={cn(
              "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              !collapsed && "ml-auto",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto p-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            // Same height in both states; when collapsed each item is a
            // square that shows only its icon.
            const shape = collapsed
              ? "mx-auto h-11 w-11 justify-center"
              : "h-11 gap-3 px-3";
            const base = cn(
              "flex items-center rounded-lg text-[15px] font-medium transition-colors",
              shape,
            );
            if (!item.enabled) {
              return (
                <div
                  key={item.to}
                  className={cn(base, "cursor-not-allowed text-muted-foreground/50")}
                  title={collapsed ? `${item.label} (coming soon)` : "Coming soon"}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!collapsed && (
                    <>
                      <span>{item.label}</span>
                      <span className="ml-auto text-[10px] uppercase tracking-wide">
                        Soon
                      </span>
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
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-accent",
                  )
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
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

      <main className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto pl-3 pt-3">
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
