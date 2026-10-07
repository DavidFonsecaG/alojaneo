import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button, Card, Spinner } from "../components/ui";
import { ApiError } from "../lib/api";
import { useDeleteHotel, useHotel } from "../lib/hooks";

const BOOKING_URL = import.meta.env.VITE_BOOKING_URL || "http://localhost:5174";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4 text-center">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </Card>
  );
}

export function HotelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const hotel = useHotel(id);
  const del = useDeleteHotel();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const h = hotel.data;

  return (
    <div className="space-y-5">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All hotels
      </Link>

      {hotel.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : hotel.isError || !h ? (
        <Card className="p-6 text-sm text-destructive">
          {hotel.isError ? (hotel.error as Error).message : "Hotel not found."}
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{h.name}</h1>
              <a
                href={`${BOOKING_URL}/${h.slug}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-sm text-ring hover:underline"
              >
                /{h.slug}
              </a>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              Created {new Date(h.created_at).toLocaleDateString()}
              <br />
              Deposit:{" "}
              <span className="capitalize">
                {h.deposit_policy_type === "percentage"
                  ? `${h.deposit_percentage ?? 0}%`
                  : h.deposit_policy_type}
              </span>{" "}
              · {h.currency}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Stat label="Rooms" value={h.counts.rooms} />
            <Stat label="Reservations" value={h.counts.reservations} />
            <Stat label="Guests" value={h.counts.guests} />
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold">Team</h2>
            <Card className="divide-y divide-border">
              {h.users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between px-4 py-2.5"
                >
                  <span className="text-sm">{u.email}</span>
                  <span
                    className={
                      "rounded-md px-2 py-0.5 text-xs font-medium capitalize " +
                      (u.role === "admin"
                        ? "bg-neutral-900 text-white"
                        : "bg-muted text-muted-foreground")
                    }
                  >
                    {u.role}
                  </span>
                </div>
              ))}
            </Card>
          </div>

          {/* Danger zone */}
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-destructive">
                  Delete hotel
                </div>
                <div className="text-xs text-muted-foreground">
                  Permanently removes the hotel and all its data.
                </div>
              </div>
              {confirming ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Sure?</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={del.isPending}
                    onClick={() =>
                      del.mutate(h.id, {
                        onSuccess: () => navigate("/"),
                        onError: (e) =>
                          setError(
                            e instanceof ApiError
                              ? e.message
                              : "Couldn't delete.",
                          ),
                      })
                    }
                  >
                    {del.isPending && <Spinner />}
                    Delete
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirming(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                  Delete
                </Button>
              )}
            </div>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </div>
        </>
      )}
    </div>
  );
}
