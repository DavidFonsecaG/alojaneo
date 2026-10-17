import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  CircleUser,
  Lock,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input, Label } from "./ui/input";
import { useAuth } from "../lib/auth";
import { useMe, useChangePassword } from "../lib/setup";
import { useUiPrefs, setPref } from "../lib/prefs";
import { ApiError } from "../lib/api";
import { cn } from "../lib/utils";

type Section = "account" | "security" | "preferences";

const NAV: { id: Section; label: string; icon: typeof CircleUser }[] = [
  { id: "account", label: "Account", icon: CircleUser },
  { id: "security", label: "Security", icon: Lock },
  { id: "preferences", label: "Preferences", icon: SlidersHorizontal },
];

function initials(email: string): string {
  const local = (email.split("@")[0] || "").replace(/[^a-zA-Z0-9]/g, "");
  return (local.slice(0, 2) || "U").toUpperCase();
}

function prettyRole(role?: string): string {
  if (role === "admin") return "Admin";
  if (role === "general") return "Staff";
  return role ? role[0].toUpperCase() + role.slice(1) : "Member";
}

// A small iOS-style toggle, used for the local preference rows.
function Switch({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        checked ? "bg-primary" : "bg-input",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

// A labelled row with a control on the right — the settings-list idiom.
function Row({
  title,
  hint,
  control,
}: {
  title: string;
  hint?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

// ── Section: Account ─────────────────────────────────────────────────
function AccountSection() {
  const { user } = useAuth();
  const me = useMe();
  const email = me.data?.email ?? "";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-lg font-semibold text-white">
          {email ? initials(email) : "··"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold leading-tight">
            {email || "Your account"}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {prettyRole(user?.role)} · {me.data?.hotelName || "Your hotel"}
          </p>
        </div>
      </div>

      <div className="divide-y divide-border rounded-xl border border-border px-4">
        <Row
          title="Email"
          hint="Used to sign in and to receive codes."
          control={<span className="text-sm text-muted-foreground">{email || "—"}</span>}
        />
        <Row
          title="Role"
          control={<span className="text-sm text-muted-foreground">{prettyRole(user?.role)}</span>}
        />
        <Row
          title="Hotel"
          control={
            <span className="text-sm text-muted-foreground">
              {me.data?.hotelName || "—"}
            </span>
          }
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Need to change your email or role? Ask a hotel admin to update it from
        Users &amp; permissions.
      </p>
    </div>
  );
}

// ── Section: Security ────────────────────────────────────────────────
function SecuritySection() {
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit =
    current.length > 0 &&
    next.length >= 8 &&
    confirm === next &&
    !change.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setDone(false);
    try {
      await change.mutateAsync({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch {
      /* error surfaced via change.error below */
    }
  }

  const errMsg =
    change.error instanceof ApiError
      ? change.error.message
      : change.error
        ? "Something went wrong. Please try again."
        : null;

  return (
    <form onSubmit={submit} className="max-w-sm space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Change password</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Enter your current password, then choose a new one (at least 8
          characters).
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cur-pw">Current password</Label>
        <Input
          id="cur-pw"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new-pw">New password</Label>
        <Input
          id="new-pw"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => {
            setNext(e.target.value);
            setDone(false);
          }}
        />
        {tooShort && (
          <p className="text-xs text-destructive">
            Must be at least 8 characters.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm-pw">Confirm new password</Label>
        <Input
          id="confirm-pw"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {mismatch && (
          <p className="text-xs text-destructive">Passwords don't match.</p>
        )}
      </div>

      {errMsg && <p className="text-sm text-destructive">{errMsg}</p>}
      {done && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600">
          <Check className="h-4 w-4" />
          Password updated.
        </p>
      )}

      <Button type="submit" disabled={!canSubmit}>
        {change.isPending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}

// ── Section: Preferences ─────────────────────────────────────────────
function PreferencesSection() {
  const prefs = useUiPrefs();

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold">Preferences</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          These apply to this browser only.
        </p>
      </div>

      <div className="divide-y divide-border rounded-xl border border-border px-4">
        <Row
          title="Notification badge"
          hint="Show the unread count on the bell."
          control={
            <Switch
              checked={prefs.notifBadge}
              onChange={(v) => setPref("notifBadge", v)}
            />
          }
        />
        <Row
          title="Reduce motion"
          hint="Minimise fade and slide animations."
          control={
            <Switch
              checked={prefs.reduceMotion}
              onChange={(v) => setPref("reduceMotion", v)}
            />
          }
        />
      </div>
    </div>
  );
}

// ── Modal shell ──────────────────────────────────────────────────────
export function UserSettingsModal({
  open,
  onClose,
  initialSection = "account",
}: {
  open: boolean;
  onClose: () => void;
  initialSection?: Section;
}) {
  const [section, setSection] = useState<Section>(initialSection);

  useEffect(() => {
    if (open) setSection(initialSection);
  }, [open, initialSection]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-primary/20" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="User settings"
        className="relative z-10 flex h-[32rem] max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-card shadow-xl"
      >
        {/* Left rail */}
        <nav className="flex w-52 shrink-0 flex-col gap-1 border-r border-border bg-muted/40 p-3">
          <p className="px-2 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Settings
          </p>
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
                  active
                    ? "bg-card text-primary shadow-sm"
                    : "text-muted-foreground hover:text-primary",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold tracking-tight">
              {NAV.find((n) => n.id === section)?.label}
            </h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {section === "account" && <AccountSection />}
            {section === "security" && <SecuritySection />}
            {section === "preferences" && <PreferencesSection />}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
