import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Spinner } from "./ui/spinner";
import { cn } from "../lib/utils";
import { useHotelSettings, useUpdateHotelSettings } from "../lib/setup";
import type { DepositPolicyType } from "../types";

const OPTIONS: {
  value: DepositPolicyType;
  title: string;
  description: string;
}[] = [
  {
    value: "none",
    title: "No prepayment",
    description: "Guests pay the full amount at the property.",
  },
  {
    value: "percentage",
    title: "Percentage of total",
    description: "Charge part of the stay up front; the rest is due at check-in.",
  },
  {
    value: "full",
    title: "Full amount",
    description: "Charge the entire stay up front at the time of booking.",
  },
];

// How much of a booking guests are charged up front. Drives the deposit shown
// and collected on the public booking engine.
export function DepositSettings() {
  const settings = useHotelSettings();
  const update = useUpdateHotelSettings();

  const [policy, setPolicy] = useState<DepositPolicyType>("none");
  const [percentage, setPercentage] = useState(30);
  const [error, setError] = useState<string | null>(null);

  const s = settings.data;
  useEffect(() => {
    if (!s) return;
    setPolicy(s.deposit_policy_type);
    setPercentage(s.deposit_percentage ?? 30);
  }, [s?.deposit_policy_type, s?.deposit_percentage]);

  const dirty =
    !!s &&
    (policy !== s.deposit_policy_type ||
      (policy === "percentage" && percentage !== (s.deposit_percentage ?? 30)));

  function save() {
    if (policy === "percentage" && (percentage < 1 || percentage > 100)) {
      setError("Percentage must be between 1 and 100.");
      return;
    }
    setError(null);
    update.mutate(
      {
        depositPolicyType: policy,
        ...(policy === "percentage" ? { depositPercentage: percentage } : {}),
      },
      { onError: () => setError("Couldn't save. Please try again.") },
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Wallet className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-base">Prepayment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings.isLoading ? (
          <Spinner />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Choose how much guests pay in advance when they book directly.
            </p>

            <div className="space-y-2">
              {OPTIONS.map((o) => {
                const active = policy === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setPolicy(o.value)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/[0.03]"
                        : "border-border hover:bg-accent",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                        active ? "border-primary" : "border-muted-foreground/40",
                      )}
                    >
                      {active && (
                        <span className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{o.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {o.description}
                      </span>
                      {o.value === "percentage" && active && (
                        <span className="mt-3 flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            value={percentage}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              setPercentage(Number(e.target.value))
                            }
                            className="h-9 w-20"
                          />
                          <span className="text-sm text-muted-foreground">
                            % of the total
                          </span>
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {dirty && (
              <div className="flex justify-end border-t border-border pt-4">
                <Button
                  type="button"
                  size="sm"
                  onClick={save}
                  disabled={update.isPending}
                >
                  {update.isPending && <Spinner />}
                  Save changes
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
