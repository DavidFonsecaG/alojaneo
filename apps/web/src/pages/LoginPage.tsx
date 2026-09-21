import { useState, type FormEvent } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input, Label } from "../components/ui/input";
import { Spinner } from "../components/ui/spinner";
import calendarPreview from "../assets/calendar-preview.png";

type Mode = "login" | "signup";

interface LocationState {
  from?: { pathname: string };
}

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

        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-3xl font-semibold tracking-tight">
            {codeStep
              ? "Check your email"
              : isSignup
                ? "Get started now"
                : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {codeStep
              ? `Enter the 6-digit code we sent to ${email}.`
              : isSignup
                ? "Create your hotel account to get going."
                : "Enter your credentials to access your dashboard."}
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            {codeStep && (
              <div className="space-y-1.5">
                <Label htmlFor="code">Verification code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="123456"
                  autoFocus
                  required
                  className="text-center text-lg tracking-[0.5em]"
                />
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
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  minLength={isSignup ? 8 : undefined}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
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
        <div className="relative flex h-full flex-col overflow-hidden rounded-3xl bg-neutral-900 p-12 text-white">
          <div className="max-w-md">
            <h2 className="text-4xl font-semibold leading-tight tracking-tight">
              The simplest way to run your hotel
            </h2>
            <p className="mt-4 text-white/70">
              Reservations, housekeeping, rates and a direct booking engine —
              all in one place.
            </p>
          </div>

          {/* Real calendar screenshot, peeking up from the bottom */}
          <div className="relative mt-10 flex-1">
            <img
              src={calendarPreview}
              alt="The Alojaneo calendar"
              className="absolute left-1/2 top-0 w-[112%] max-w-none -translate-x-1/2 rounded-2xl border border-white/10 shadow-2xl"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
