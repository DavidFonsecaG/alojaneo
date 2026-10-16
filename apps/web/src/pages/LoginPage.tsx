import {
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { Check, Eye, EyeOff, Mail } from "lucide-react";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input, Label } from "../components/ui/input";
import { Spinner } from "../components/ui/spinner";
import { cn } from "../lib/utils";
import calendarPreview from "../assets/calendar-preview.png";

type Mode = "login" | "signup";

interface LocationState {
  from?: { pathname: string };
}

const HIGHLIGHTS = [
  "Double-bookings blocked at the database — never oversell",
  "Your own direct booking engine, branded to your hotel",
  "Reservations, housekeeping, rates & payments in one place",
];

// The hexagon brand mark used in the app sidebar.
function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}

// Segmented 6-digit code input with auto-advance, backspace, arrows and paste.
function OtpInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const chars = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  function setAt(i: number, digit: string) {
    const next = (value.slice(0, i) + digit + value.slice(i + 1))
      .slice(0, 6)
      .replace(/\D/g, "");
    onChange(next);
  }

  function onBoxChange(i: number, raw: string) {
    const d = raw.replace(/\D/g, "");
    if (!d) {
      setAt(i, "");
      return;
    }
    setAt(i, d[d.length - 1]);
    if (i < 5) refs.current[i + 1]?.focus();
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !chars[i] && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < 5) {
      e.preventDefault();
      refs.current[i + 1]?.focus();
    }
  }

  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    onChange(text);
    refs.current[Math.min(text.length, 5)]?.focus();
  }

  return (
    <div className="flex gap-2" onPaste={onPaste}>
      {chars.map((c, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={c}
          disabled={disabled}
          autoFocus={i === 0}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => onBoxChange(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onFocus={(e) => e.currentTarget.select()}
          className="h-14 w-full rounded-xl border border-input bg-card text-center text-xl font-semibold tabular-nums shadow-sm transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ))}
    </div>
  );
}

export function LoginPage() {
  const { isAuthenticated, login, verifyCode, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<"credentials" | "code">("credentials");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [hotelName, setHotelName] = useState("");
  const [hotelSlug, setHotelSlug] = useState("");

  const redirectTo =
    (location.state as LocationState)?.from?.pathname ?? "/reservations";

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  const isSignup = mode === "signup";
  const codeStep = !isSignup && step === "code";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isSignup) {
        await signup({ hotelName, hotelSlug, email, password });
        navigate(redirectTo, { replace: true });
      } else if (step === "credentials") {
        await login(email, password);
        setCode("");
        setStep("code");
      } else {
        await verifyCode(email, code);
        navigate(redirectTo, { replace: true });
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode() {
    setMode(isSignup ? "login" : "signup");
    setStep("credentials");
    setError(null);
  }

  function backToCredentials() {
    setStep("credentials");
    setCode("");
    setError(null);
  }

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-2">
      {/* ── Left: form ─────────────────────────────────────────────── */}
      <div className="relative flex min-h-screen flex-col justify-center px-6 py-14 sm:px-12 lg:px-16">
        {/* Brand mark, top-left */}
        <div className="absolute left-6 top-8 flex items-center gap-2 sm:left-12 lg:left-16">
          <span className="flex size-9 items-center justify-center rounded-xl bg-neutral-900 text-white">
            <BrandMark className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold">Alojaneo</span>
        </div>

        <div className="mx-auto w-full max-w-sm animate-fade-in">
          {codeStep && (
            <span className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-neutral-900 text-white">
              <Mail className="h-5 w-5" />
            </span>
          )}
          <h1 className="text-3xl font-semibold tracking-tight">
            {codeStep
              ? "Check your email"
              : isSignup
                ? "Get started now"
                : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {codeStep ? (
              <>
                Enter the 6-digit code we sent to{" "}
                <span className="font-medium text-foreground">{email}</span>.
              </>
            ) : isSignup ? (
              "Create your hotel account to get going."
            ) : (
              "Enter your credentials to access your dashboard."
            )}
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            {codeStep && (
              <div className="space-y-2">
                <Label htmlFor="code">Verification code</Label>
                <OtpInput value={code} onChange={setCode} disabled={submitting} />
              </div>
            )}
            {!codeStep && isSignup && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="hotelName">Hotel name</Label>
                  <Input
                    id="hotelName"
                    value={hotelName}
                    onChange={(e) => setHotelName(e.target.value)}
                    placeholder="Hotel Miramar"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hotelSlug">Hotel slug</Label>
                  <Input
                    id="hotelSlug"
                    value={hotelSlug}
                    onChange={(e) =>
                      setHotelSlug(
                        e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                      )
                    }
                    placeholder="hotel-miramar"
                    pattern="[a-z0-9-]+"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Used in your public booking URL. Lowercase, hyphens only.
                  </p>
                </div>
              </>
            )}

            {!codeStep && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@hotel.com"
                    autoComplete="email"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isSignup ? "min 8 chars" : "••••••••"}
                      autoComplete={
                        isSignup ? "new-password" : "current-password"
                      }
                      minLength={isSignup ? 8 : undefined}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={submitting || (codeStep && code.length !== 6)}
            >
              {submitting && <Spinner />}
              {codeStep
                ? "Verify & sign in"
                : isSignup
                  ? "Create account"
                  : "Sign in"}
            </Button>

            {codeStep && (
              <button
                type="button"
                onClick={backToCredentials}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
              >
                Use a different email
              </button>
            )}
          </form>

          {!codeStep && (
            <p className="mt-6 text-sm text-muted-foreground">
              {isSignup ? "Have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                className="font-medium text-foreground hover:underline"
                onClick={switchMode}
              >
                {isSignup ? "Sign in" : "Sign up"}
              </button>
            </p>
          )}
        </div>

        <p className="absolute inset-x-0 bottom-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Alojaneo. All rights reserved.
        </p>
      </div>

      {/* ── Right: brand panel (desktop only) ──────────────────────── */}
      <div className="hidden p-3 lg:block">
        <div className="relative flex h-full flex-col overflow-hidden rounded-3xl bg-neutral-950 p-12 text-white">
          {/* Ambient glow + fine dot grid for depth */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_12%,rgba(255,255,255,0.12),transparent_55%)]"
          />
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 opacity-[0.6]",
              "bg-[radial-gradient(rgba(255,255,255,0.055)_1px,transparent_1px)] [background-size:22px_22px]",
            )}
          />

          <div className="relative z-10 max-w-md">
            <h2 className="text-4xl font-semibold leading-tight tracking-tight">
              The simplest way to run your hotel
            </h2>
            <p className="mt-4 text-white/60">
              Reservations, housekeeping, rates and a direct booking engine —
              all in one place.
            </p>

            <ul className="mt-8 space-y-3.5">
              {HIGHLIGHTS.map((h) => (
                <li key={h} className="flex items-start gap-3 text-sm text-white/80">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-inset ring-white/15">
                    <Check className="h-3 w-3" />
                  </span>
                  {h}
                </li>
              ))}
            </ul>
          </div>

          {/* Real calendar screenshot, framed and peeking up from the bottom */}
          <div className="relative z-10 mt-12 flex-1">
            <div
              aria-hidden
              className="absolute left-1/2 top-4 h-40 w-[90%] -translate-x-1/2 rounded-full bg-white/10 blur-3xl"
            />
            <img
              src={calendarPreview}
              alt="The Alojaneo calendar"
              className="absolute left-1/2 top-0 w-[112%] max-w-none -translate-x-1/2 rounded-2xl ring-1 ring-white/10 shadow-2xl"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
