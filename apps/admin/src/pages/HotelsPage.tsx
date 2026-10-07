import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Plus } from "lucide-react";
import { Button, Card, Field, Input, Spinner } from "../components/ui";
import { ApiError } from "../lib/api";
import { useCreateHotel, useHotels } from "../lib/hooks";

const bookingsOf = (seq: number) => Math.max(0, seq - 1000);

export function HotelsPage() {
  const navigate = useNavigate();
  const hotels = useHotels();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hotels</h1>
          <p className="text-sm text-muted-foreground">
            Every hotel on the platform.
          </p>
        </div>
        <Button type="button" onClick={() => setCreating((v) => !v)}>
          <Plus className="h-4 w-4" />
          New hotel
        </Button>
      </div>

      {creating && <CreateHotelForm onDone={() => setCreating(false)} />}

      {hotels.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : hotels.isError ? (
        <Card className="p-6 text-sm text-destructive">
          {(hotels.error as Error).message}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(hotels.data ?? []).map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => navigate(`/hotels/${h.id}`)}
              className="rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent"
            >
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="truncate font-medium">{h.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    /{h.slug}
                  </div>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <dt className="text-muted-foreground">Bookings</dt>
                  <dd className="font-semibold tabular-nums">
                    {bookingsOf(h.booking_seq)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Deposit</dt>
                  <dd className="font-semibold capitalize">
                    {h.deposit_policy_type === "percentage"
                      ? `${h.deposit_percentage ?? 0}%`
                      : h.deposit_policy_type}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Currency</dt>
                  <dd className="font-semibold">{h.currency}</dd>
                </div>
              </dl>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateHotelForm({ onDone }: { onDone: () => void }) {
  const create = useCreateHotel();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !slug.trim() || !adminEmail.trim() || adminPassword.length < 8) {
      setError("All fields are required (password ≥ 8 characters).");
      return;
    }
    create.mutate(
      { name: name.trim(), slug: slug.trim(), adminEmail: adminEmail.trim(), adminPassword },
      {
        onSuccess: onDone,
        onError: (err) =>
          setError(err instanceof ApiError ? err.message : "Couldn't create hotel."),
      },
    );
  }

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold">New hotel</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Creates the hotel plus its first admin account.
      </p>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Hotel name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Hotel Miramar" />
        </Field>
        <Field label="Slug">
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
            placeholder="hotel-miramar"
          />
        </Field>
        <Field label="Admin email">
          <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@hotel.com" />
        </Field>
        <Field label="Admin password">
          <Input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="min 8 chars" />
        </Field>
        {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={create.isPending}>
            {create.isPending && <Spinner />}
            Create hotel
          </Button>
        </div>
      </form>
    </Card>
  );
}
