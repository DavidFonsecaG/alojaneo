import { PageHeader } from "../components/Layout";
import { useAuth } from "../lib/auth";
import { RoomsSetup } from "./RoomsPage";

// Property configuration, admin-only. Room/room-type setup lives here so the
// Rooms nav page can stay a pure operations board. The API also enforces the
// admin/manage gate, so this is defence in depth, not the only check.
export function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Property configuration" />

      {isAdmin ? (
        <RoomsSetup />
      ) : (
        <p className="rounded-3xl bg-card p-6 text-sm text-muted-foreground shadow-sm">
          You need admin access to change property settings.
        </p>
      )}
    </div>
  );
}
