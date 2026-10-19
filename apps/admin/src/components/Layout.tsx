import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Button } from "./ui";

export function Layout() {
  const { logout } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src="/alojaneo-icon.svg"
              alt=""
              className="size-8 rounded-lg"
            />
            <div className="leading-tight">
              <div className="font-brand text-base font-extrabold tracking-[-0.02em] text-[#15233F]">
                Alojaneo
              </div>
              <div className="text-xs text-muted-foreground">Platform admin</div>
            </div>
          </Link>
          <Button type="button" variant="outline" size="sm" onClick={logout}>
            Log out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
