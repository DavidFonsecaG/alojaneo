import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BedDouble, StickyNote, User, Wallet } from "lucide-react";
import { PageHeader } from "../components/Layout";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "../components/ui/button";
import { Input, Select } from "../components/ui/input";
import { Field } from "../components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { CenteredSpinner, Spinner } from "../components/ui/spinner";
import {
  useAddNote,
  useCreatePayment,
  usePayments,
  useReservation,
  useUpdateRoomStatus,
} from "../lib/reservations";
import { useGuest, useUpdateGuest } from "../lib/setup";
import { ApiError } from "../lib/api";
import { cn } from "../lib/utils";
import { centsToInput, formatDate, formatMoney, inputToCents, nights } from "../lib/format";
import type {
  PaymentMethod,
  ReservationRoom,
  ReservationRoomStatus,
} from "../types";

const ROOM_STATUSES: ReservationRoomStatus[] = [
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
];

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "credit_card", label: "Credit card" },
  { value: "bank_transfer", label: "Bank transfer" },
];

export function ReservationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error } = useReservation(id);

  if (isLoading) return <CenteredSpinner label="Loading reservation…" />;

  if (isError || !data) {
    return (
      <div>
        <BackLink />
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {isError ? (error as Error).message : "Reservation not found."}
        </div>
      </div>
    );
  }

  const totalNights = data.rooms.reduce(
    (sum, r) => sum + nights(r.check_in, r.check_out),
    0,
  );
  // Our model keeps the money on each room, so fall back to summing them when
  // the reservation folder has no stored total.
  const totalCents =
    data.total_amount_cents ??
    data.rooms.reduce((s, r) => s + r.rate_cents, 0);

  return (
    <>
      <PageHeader
        title={`${data.guest_first_name} ${data.guest_last_name}`}
        description={`${data.booking_ref} · ${data.rooms.length} room${data.rooms.length === 1 ? "" : "s"} · ${totalNights} room-night${totalNights === 1 ? "" : "s"} · ${data.source.replace(/_/g, " ")}`}
        actions={
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Total
            </div>
            <div className="text-lg font-semibold">
              {formatMoney(totalCents)}
            </div>
          </div>
        }
      />

      <div>
        <BackLink />

        <div className="mt-4 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader className="flex-row items-center gap-2 space-y-0">
                <BedDouble className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Rooms</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.rooms.map((room) => (
                  <RoomRow
                    key={room.id}
                    room={room}
                    reservationId={data.id}
                  />
                ))}
              </CardContent>
            </Card>

            <GuestCard guestId={data.guest_id} />
          </div>

          <div className="space-y-6 lg:col-span-1">
            <PaymentCard reservationId={data.id} totalCents={totalCents} />
            <NotesCard reservationId={data.id} notes={data.notes} />
          </div>
        </div>
      </div>
    </>
  );
}

function BackLink() {
  return (
    <Link
      to="/reservations"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to reservations
    </Link>
  );
}

function RoomRow({
  room,
  reservationId,
}: {
  room: ReservationRoom;
  reservationId: string;
}) {
  const mutation = useUpdateRoomStatus(reservationId);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            Room {room.room_number ?? "—"}
          </span>
          <StatusBadge status={room.status} />
        </div>
        <div className="mt-0.5 text-sm text-muted-foreground">
          {formatDate(room.check_in)} → {formatDate(room.check_out)} ·{" "}
          {nights(room.check_in, room.check_out)} night
          {nights(room.check_in, room.check_out) === 1 ? "" : "s"} ·{" "}
          {formatMoney(room.rate_cents)}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {mutation.isPending && <Spinner />}
        <Select
          className="w-40"
          value={room.status}
          disabled={mutation.isPending}
          onChange={(e) =>
            mutation.mutate({
              roomId: room.id,
              status: e.target.value as ReservationRoomStatus,
            })
          }
        >
          {ROOM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

// Editable guest record for this reservation — the same fields the timeline
// popup exposes, rendered as a page card.
function GuestCard({ guestId }: { guestId: string }) {
  const guest = useGuest(guestId);
  const update = useUpdateGuest();
  const g = guest.data;

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!g) return;
    setForm({
      firstName: g.first_name,
      lastName: g.last_name,
      email: g.email ?? "",
      phone: g.phone ?? "",
    });
  }, [g?.id, g?.first_name, g?.last_name, g?.email, g?.phone]);

  const dirty =
    !!g &&
    (form.firstName !== g.first_name ||
      form.lastName !== g.last_name ||
      form.email !== (g.email ?? "") ||
      form.phone !== (g.phone ?? ""));

  function save(e: FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    setError(null);
    update.mutate(
      {
        id: guestId,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        documentType: g?.document_type ?? undefined,
        documentNumber: g?.document_number ?? undefined,
      },
      { onError: () => setError("Couldn't save changes.") },
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <User className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-base">Guest details</CardTitle>
      </CardHeader>
      <CardContent>
        {guest.isLoading ? (
          <Spinner />
        ) : (
          <form onSubmit={save} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name" htmlFor="g-first">
                <Input
                  id="g-first"
                  value={form.firstName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, firstName: e.target.value }))
                  }
                />
              </Field>
              <Field label="Last name" htmlFor="g-last">
                <Input
                  id="g-last"
                  value={form.lastName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, lastName: e.target.value }))
                  }
                />
              </Field>
              <Field label="Email" htmlFor="g-email">
                <Input
                  id="g-email"
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                />
              </Field>
              <Field label="Phone" htmlFor="g-phone">
                <Input
                  id="g-phone"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                />
              </Field>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {dirty && (
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={update.isPending}>
                  {update.isPending && <Spinner />}
                  Save changes
                </Button>
              </div>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// Booking money: total, received, outstanding, the recorded payments, and an
// inline record-payment form.
function PaymentCard({
  reservationId,
  totalCents,
}: {
  reservationId: string;
  totalCents: number;
}) {
  const payments = usePayments(reservationId);
  const [recording, setRecording] = useState(false);

  const received = (payments.data ?? [])
    .filter((p) => p.status === "completed")
    .reduce((s, p) => s + p.amount_cents, 0);
  const outstanding = totalCents - received;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Wallet className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-base">Payment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="space-y-2.5 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">Total</dt>
            <dd className="text-base font-semibold tabular-nums text-foreground">
              {formatMoney(totalCents)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">Received</dt>
            <dd className="text-base font-semibold tabular-nums text-emerald-600">
              {formatMoney(received)}
            </dd>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-border pt-3">
            <dt className="font-semibold text-foreground">Outstanding</dt>
            <dd
              className={cn(
                "text-xl font-bold tabular-nums",
                outstanding > 0 ? "text-destructive" : "text-emerald-600",
              )}
            >
              {formatMoney(outstanding)}
            </dd>
          </div>
        </dl>

        {(payments.data ?? []).length > 0 && (
          <ul className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            {(payments.data ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span className="capitalize">
                  {p.method.replace(/_/g, " ")}
                  {p.status !== "completed" ? ` · ${p.status}` : ""}
                </span>
                <span className="tabular-nums">
                  {formatMoney(p.amount_cents)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {recording ? (
          <RecordPaymentForm
            reservationId={reservationId}
            defaultCents={outstanding > 0 ? outstanding : 0}
            onDone={() => setRecording(false)}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setRecording(true)}
          >
            Record payment
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function RecordPaymentForm({
  reservationId,
  defaultCents,
  onDone,
}: {
  reservationId: string;
  defaultCents: number;
  onDone: () => void;
}) {
  const create = useCreatePayment(reservationId);
  const [amount, setAmount] = useState(
    defaultCents > 0 ? centsToInput(defaultCents) : "",
  );
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const cents = inputToCents(amount);
    if (cents <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    create.mutate(
      { amountCents: cents, method },
      {
        onSuccess: onDone,
        onError: (err) =>
          setError(
            err instanceof ApiError ? err.message : "Couldn't record payment.",
          ),
      },
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-2 rounded-md border border-dashed border-border p-3"
    >
      <Field label="Amount" htmlFor="pay-amount">
        <Input
          id="pay-amount"
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <Field label="Method" htmlFor="pay-method">
        <Select
          id="pay-method"
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDone}
          disabled={create.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={create.isPending}>
          {create.isPending && <Spinner />}
          Record
        </Button>
      </div>
    </form>
  );
}

function NotesCard({
  reservationId,
  notes,
}: {
  reservationId: string;
  notes: { id: string; body: string; user_email: string; created_at: string }[];
}) {
  const [body, setBody] = useState("");
  const addNote = useAddNote(reservationId);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    addNote.mutate(trimmed, { onSuccess: () => setBody("") });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <StickyNote className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-base">Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={onSubmit} className="space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Add a note…"
            className="flex w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            type="submit"
            size="sm"
            disabled={addNote.isPending || !body.trim()}
          >
            {addNote.isPending && <Spinner />}
            Add note
          </Button>
        </form>

        <div className="space-y-3">
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            notes.map((note) => (
              <div key={note.id} className="rounded-md bg-muted/50 p-3">
                <p className="text-sm">{note.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {note.user_email} ·{" "}
                  {new Date(note.created_at).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
