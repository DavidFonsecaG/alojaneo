import { useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { Button, Card, Field, Input, Spinner } from "../components/ui";

export function LoginPage() {
  const { login, verifyCode } = useAuth();
  const [step, setStep] = useState<"credentials" | "code">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (step === "credentials") {
        await login(email, password);
        setCode("");
        setStep("code");
      } else {
        await verifyCode(email, code);
        // AuthProvider flips isAuthenticated; App swaps to the console.
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }

  const codeStep = step === "code";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-8">
        <div className="flex flex-col items-center text-center">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">
            {codeStep ? "Check your email" : "Platform admin"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {codeStep
              ? `Enter the 6-digit code sent to ${email}.`
              : "Owner access to manage all hotels."}
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          {codeStep ? (
            <Field label="Verification code">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="123456"
                autoFocus
                className="text-center text-lg tracking-[0.5em]"
              />
            </Field>
          ) : (
            <>
              <Field label="Email">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@alojaneo.com"
                  autoComplete="email"
                />
              </Field>
              <Field label="Password">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </Field>
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={busy || (codeStep && code.length !== 6)}
          >
            {busy && <Spinner />}
            {codeStep ? "Verify & sign in" : "Continue"}
          </Button>

          {codeStep && (
            <button
              type="button"
              onClick={() => {
                setStep("credentials");
                setCode("");
                setError(null);
              }}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
            >
              Use a different email
            </button>
          )}
        </form>
      </Card>
    </div>
  );
}
