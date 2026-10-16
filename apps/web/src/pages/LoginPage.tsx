import {
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { Check, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input, Label } from "../components/ui/input";
import { Spinner } from "../components/ui/spinner";

type Mode = "login" | "signup";

interface LocationState {
  from?: { pathname: string };
}

const HIGHLIGHTS = [
  "No double-booking",
  "Direct booking engine",
  "Housekeeping & payments",
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

  const heading = codeStep
    ? "Check your email"
    : isSignup
      ? "Get started now"
      : "Welcome back";

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-neutral-200 px-4 py-12">
      {/* Light, airy backdrop — a bright spotlight behind the card fading to a
          soft neutral at the edges, over a faint dot grid for texture. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_34%,#ffffff_0%,rgba(255,255,255,0.6)_30%,transparent_62%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60 bg-[radial-gradient(rgba(16,24,40,0.05)_1px,transparent_1px)] [background-size:22px_22px]"
      />

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="rounded-3xl bg-card p-8 shadow-xl ring-1 ring-black/5 sm:p-10">
          {/* Brand lockup */}
          <div className="flex items-center justify-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-neutral-900 text-white">
              <BrandMark className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold">Alojaneo</span>
          </div>

          <h1 className="mt-7 text-center text-2xl font-semibold tracking-tight">
            {heading}
          </h1>
          <p className="mt-1.5 text-center text-sm text-muted-foreground">
            {codeStep ? (
              <>
                Enter the 6-digit code we sent to{" "}
                <span className="font-medium text-foreground">{email}</span>.
              </>
            ) : isSignup ? (
              "Create your hotel account to get going."
            ) : (
              "Sign in to your dashboard."
            )}
          </p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
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
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {!isSignup && (
                      <span className="text-xs text-muted-foreground">
                        We'll email a sign-in code
                      </span>
                    )}
                  </div>
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
                  : "Continue"}
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
            <p className="mt-6 text-center text-sm text-muted-foreground">
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

        {/* Product highlights + footer */}
        {!codeStep && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {HIGHLIGHTS.map((h) => (
              <span key={h} className="flex items-center gap-1.5">
                <Check className="h-3 w-3 text-muted-foreground/60" />
                {h}
              </span>
            ))}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Alojaneo. All rights reserved.
        </p>
      </div>
    </div>
  );
}
