import { NavLink, Outlet } from "react-router-dom";
import {
  CalendarRange,
  BedDouble,
  Users,
  Tags,
  Sparkles,
  Settings,
  LogOut,
  ClipboardList,
  Hotel,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
}

const NAV: NavItem[] = [
  { to: "/reservations", label: "Reservations", icon: ClipboardList, enabled: true },
  { to: "/timeline", label: "Timeline", icon: CalendarRange, enabled: true },
  { to: "/rooms", label: "Rooms", icon: BedDouble, enabled: true },
  { to: "/rate-plans", label: "Rate plans", icon: Tags, enabled: true },
  { to: "/guests", label: "Guests", icon: Users, enabled: true },
  { to: "/housekeeping", label: "Housekeeping", icon: Sparkles, enabled: false },
  { to: "/settings", label: "Settings", icon: Settings, enabled: false },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex h-14 items-center gap-2 border-b border-border px-5">
          <Hotel className="h-5 w-5 text-primary" />
          <span className="font-semibold">HRS</span>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            if (!item.enabled) {
              return (
                <div
                  key={item.to}
                  className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground/60"
                  title="Coming soon"
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-wide">
                    Soon
                  </span>
                </div>
              );
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-accent",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="mb-2 px-2 text-xs text-muted-foreground">
            Signed in as{" "}
            <span className="font-medium capitalize text-foreground">
              {user?.role}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            Log out
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">
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
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border bg-card px-8 py-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
