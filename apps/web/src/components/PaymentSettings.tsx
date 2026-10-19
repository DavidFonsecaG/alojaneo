import { useEffect, useState } from "react";
import { Check, Copy, CreditCard } from "lucide-react";
import { Button } from "./ui/button";
import { Input, Label, Select } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Checkbox } from "./ui/field";
import { Spinner } from "./ui/spinner";
import {
  useHotelPaymentSettings,
  useUpdateHotelPaymentSettings,
} from "../lib/setup";

// Per-provider labels for the two credential fields (we store them generically
// as public/private key, but each gateway names them differently).
const KEY_LABELS: Record<string, { pub: string; priv: string; help: string }> = {
  kushki: {
    pub: "Public merchant ID",
    priv: "Private merchant ID",
    help: "From your Kushki console → Developers → Credentials.",
  },
  payphone: {
    pub: "Store ID",
    priv: "API token",
    help: "From your PayPhone business console.",
  },
  mock: {
    pub: "Public key",
    priv: "Private key",
    help: "The mock gateway settles instantly — no real keys needed. For testing the flow.",
  },
};

export function PaymentSettings() {
  const settings = useHotelPaymentSettings();
  const update = useUpdateHotelPaymentSettings();
  const s = settings.data;

  const [provider, setProvider] = useState("mock");
  const [publicKey, setPublicKey] = useState("");
  const [privateKey, setPrivateKey] = useState(""); // write-only; blank = keep
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!s) return;
    setProvider(s.provider);
    setPublicKey(s.publicKey ?? "");
    setPrivateKey("");
    setEnabled(s.enabled);
  }, [s?.provider, s?.publicKey, s?.enabled]);

  const dirty =
    !!s &&
    (provider !== s.provider ||
      publicKey !== (s.publicKey ?? "") ||
      privateKey.length > 0 ||
      enabled !== s.enabled);

  const labels = KEY_LABELS[provider] ?? KEY_LABELS.mock;
  const needsKeys = provider !== "mock";

  function save() {
    setError(null);
    if (enabled && needsKeys && !publicKey.trim()) {
      setError("A public key is required to enable this gateway.");
      return;
    }
    if (enabled && needsKeys && !s?.hasPrivateKey && !privateKey.trim()) {
      setError("A private key is required to enable this gateway.");
      return;
    }
    const input: {
      provider?: string;
      publicKey?: string | null;
      privateKey?: string;
      enabled?: boolean;
    } = {};
    if (provider !== s?.provider) input.provider = provider;
    if (publicKey !== (s?.publicKey ?? "")) input.publicKey = publicKey || null;
    if (privateKey.length > 0) input.privateKey = privateKey;
    if (enabled !== s?.enabled) input.enabled = enabled;

    update.mutate(input, {
      onSuccess: () => {
        setPrivateKey("");
        setError(null);
      },
      onError: () => setError("Couldn't save payment settings. Please try again."),
    });
  }

  function reset() {
    if (!s) return;
    setProvider(s.provider);
    setPublicKey(s.publicKey ?? "");
    setPrivateKey("");
    setEnabled(s.enabled);
    setError(null);
  }

  async function copyWebhook() {
    if (!s?.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(s.webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <CreditCard className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-base">Payment gateway</CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {settings.isLoading ? (
          <Spinner />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Connect a gateway to collect deposits online. Your secret key is
              encrypted and never shown again after saving.
            </p>

            {/* Provider */}
            <div className="max-w-sm space-y-1.5">
              <Label htmlFor="pay-provider">Provider</Label>
              <Select
                id="pay-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                <option value="mock">Test (mock — no real charges)</option>
                <option value="kushki">Kushki</option>
                <option value="payphone">PayPhone</option>
              </Select>
              <p className="text-xs text-muted-foreground">{labels.help}</p>
            </div>

            {needsKeys && (
              <>
                <div className="max-w-sm space-y-1.5">
                  <Label htmlFor="pay-public">{labels.pub}</Label>
                  <Input
                    id="pay-public"
                    value={publicKey}
                    onChange={(e) => setPublicKey(e.target.value)}
                    placeholder="pub_…"
                    autoComplete="off"
                  />
                </div>

                <div className="max-w-sm space-y-1.5">
                  <Label htmlFor="pay-private">{labels.priv}</Label>
                  <Input
                    id="pay-private"
                    type="password"
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    placeholder={
                      s?.hasPrivateKey
                        ? "•••••••• (saved — leave blank to keep)"
                        : "private_…"
                    }
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Stored encrypted. Leave blank to keep the current key.
                  </p>
                </div>
              </>
            )}

            {/* Enable */}
            <div className="space-y-1.5">
              <Checkbox
                id="pay-enabled"
                checked={enabled}
                onChange={setEnabled}
                label="Collect deposits through this gateway"
              />
              <p className="pl-6 text-xs text-muted-foreground">
                When off, bookings don't prepay (guests pay at the property).
              </p>
            </div>

            {/* Webhook URL */}
            {s?.webhookUrl && (
              <div className="space-y-1.5 rounded-xl border border-border bg-muted/40 p-3">
                <div className="text-sm font-medium">Webhook URL</div>
                <p className="text-xs text-muted-foreground">
                  Add this to your gateway dashboard so payments confirm reliably
                  even if the guest doesn't return.
                </p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md bg-card px-2 py-1.5 text-xs">
                    {s.webhookUrl}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copyWebhook}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            {dirty && (
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={reset}
                  disabled={update.isPending}
                >
                  Cancel
                </Button>
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
