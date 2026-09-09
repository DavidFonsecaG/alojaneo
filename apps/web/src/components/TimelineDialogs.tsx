import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input, Label, Select } from "./ui/input";
import { Field } from "./ui/field";
import { StatusBadge } from "./StatusBadge";
import { CenteredSpinner, Spinner } from "./ui/spinner";
import {
  useGuest,
  useGuests,
  useRatePlans,
  useRooms,
  useCreateGuest,
  useUpdateGuest,
} from "../lib/setup";
import {
  useAddNote,
  useAddReservationRoom,
  useCreatePayment,
  useCreateReservation,
  usePayments,
  useRemoveReservationRoom,
  useReservation,
  useTimeline,
  useUpdateRoomDetails,
  useUpdateRoomStatus,
} from "../lib/reservations";
import { ApiError } from "../lib/api";
import { cn } from "../lib/utils";
import {
  centsToInput,
  formatDate,
  formatMoney,
  inputToCents,
  nights,
  toDateInput,
} from "../lib/format";
import type {
  PaymentMethod,
  Room,
  ReservationRoom,
  ReservationRoomStatus,
} from "../types";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "credit_card", label: "Credit card" },
  { value: "bank_transfer", label: "Bank transfer" },
];

// Prominent section heading used across the reservation popup so each block
// (Rooms, Guest, Notes) reads as its own clear subtitle rather than a faint
// uppercase label.
function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-base font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      {action}
    </div>
  );
}

const ROOM_STATUSES: ReservationRoomStatus[] = [
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
];

// ── Quick create ─────────────────────────────────────────────────────
// Opened from an empty timeline cell, seeded with the clicked room + dates.
// Supports several rooms under one guest and one date range — e.g. a family
// taking two rooms — which the reservation model already stores as one
// "folder" with multiple reservation_rooms.
interface RoomLine {
  key: string;
  roomId: string;
  ratePlanId: string; // "" = no plan
  rateCents: number;
  rateEdited: boolean;
}

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export function QuickCreateDialog({
  room,
  checkIn: initialCheckIn,
  checkOut: initialCheckOut,
  onClose,
}: {
  room: Room;
  checkIn: string;
  checkOut: string;
  onClose: () => void;
}) {
  const rooms = useRooms();
  const guests = useGuests();
  const ratePlans = useRatePlans();
  const createGuest = useCreateGuest();
  const createReservation = useCreateReservation();

  const [guestMode, setGuestMode] = useState<"existing" | "new">("existing");
  const [guestId, setGuestId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [lines, setLines] = useState<RoomLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const roomById = new Map((rooms.data ?? []).map((r) => [r.id, r]));
  const planById = new Map((ratePlans.data ?? []).map((p) => [p.id, p]));

  const validDates = !!checkIn && !!checkOut && checkOut > checkIn;
  const n = validDates ? nights(checkIn, checkOut) : 0;

  // Rooms already booked (by any active reservation) over the chosen nights.
  // The timeline endpoint is windowed and already treats a same-day
  // checkout→checkin handoff as free, matching the booking rules.
  const occupancy = useTimeline(
    validDates ? checkIn : "",
    validDates ? checkOut : "",
  );
  const occupiedRoomIds = new Set(
    (occupancy.data ?? []).map((s) => s.room_id),
  );

  const plansForRoom = (roomId: string) => {
    const r = roomById.get(roomId);
    return r
      ? (ratePlans.data ?? []).filter((p) => p.room_type_id === r.room_type_id)
      : [];
  };
  const defaultRate = (ratePlanId: string, nightsCount: number) => {
    const p = planById.get(ratePlanId);
    return p ? p.base_rate_cents * Math.max(nightsCount, 1) : 0;
  };

  const addRoom = (roomId: string) => {
    const plans = plansForRoom(roomId);
    const ratePlanId = plans[0]?.id ?? "";
    setLines((prev) => [
      ...prev,
      {
        key: uid(),
        roomId,
        ratePlanId,
        rateCents: defaultRate(ratePlanId, n),
        rateEdited: false,
      },
    ]);
  };

  // Seed the first line with the clicked room, once rooms + plans have loaded.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (ratePlans.isLoading || rooms.isLoading) return;
    seededRef.current = true;
    addRoom(room.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratePlans.isLoading, rooms.isLoading]);

  const removeLine = (key: string) =>
    setLines((prev) => prev.filter((l) => l.key !== key));

  const setLinePlan = (key: string, ratePlanId: string) =>
    setLines((prev) =>
      prev.map((l) =>
        l.key === key
          ? {
              ...l,
              ratePlanId,
              rateCents: defaultRate(ratePlanId, n),
              rateEdited: false,
            }
          : l,
      ),
    );

  const setLineRate = (key: string, value: string) =>
    setLines((prev) =>
      prev.map((l) =>
        l.key === key
          ? { ...l, rateCents: inputToCents(value), rateEdited: true }
          : l,
      ),
    );

  const onDates = (nextIn: string, nextOut: string) => {
    setCheckIn(nextIn);
    setCheckOut(nextOut);
    const nn =
      nextIn && nextOut && nextOut > nextIn ? nights(nextIn, nextOut) : 0;
    setLines((prev) =>
      prev.map((l) =>
        l.rateEdited || !l.ratePlanId
          ? l
          : { ...l, rateCents: defaultRate(l.ratePlanId, nn) },
      ),
    );
  };

  const addableRooms = (rooms.data ?? []).filter(
    (r) =>
      r.status === "available" &&
      !lines.some((l) => l.roomId === r.id) &&
      !occupiedRoomIds.has(r.id),
  );
  const total = lines.reduce((sum, l) => sum + l.rateCents, 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validDates) return setError("Check-out must be after check-in.");
    if (lines.length === 0) return setError("Add at least one room.");
    if (guestMode === "existing" && !guestId)
      return setError("Select a guest, or add a new one.");
    if (guestMode === "new" && (!firstName.trim() || !lastName.trim()))
      return setError("Enter the guest's first and last name.");

    setSubmitting(true);
    try {
      let resolvedGuestId = guestId;
      if (guestMode === "new") {
        const g = await createGuest.mutateAsync({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
        });
        resolvedGuestId = g.id;
      }
      await createReservation.mutateAsync({
        guestId: resolvedGuestId,
        rooms: lines.map((l) => ({
          roomId: l.roomId,
          ratePlanId: l.ratePlanId || undefined,
          rateCents: l.rateCents,
          checkIn,
          checkOut,
        })),
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to create reservation.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="New reservation"
      description={`One guest · ${lines.length} room${
        lines.length === 1 ? "" : "s"
      } · ${n || 1} night${(n || 1) === 1 ? "" : "s"}`}
      className="max-w-5xl"
      headerAccent
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="quick-create-form"
            disabled={submitting || !validDates || lines.length === 0}
          >
            {submitting && <Spinner />}
            Create reservation
          </Button>
        </>
      }
    >
      <form id="quick-create-form" onSubmit={onSubmit}>
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-[1fr_20rem] md:items-start">
            <div className="space-y-6">
              {/* Guest */}
              <section className="space-y-3">
                <SectionHeader
                  title="Guest"
                  action={
                    <div className="flex gap-1 text-sm">
                      <button
                        type="button"
                        onClick={() => setGuestMode("existing")}
                        className={
                          guestMode === "existing"
                            ? "font-medium text-blue-500"
                            : "text-muted-foreground hover:text-foreground"
                        }
                      >
                        Existing
                      </button>
                      <span className="text-muted-foreground">·</span>
                      <button
                        type="button"
                        onClick={() => setGuestMode("new")}
                        className={
                          guestMode === "new"
                            ? "font-medium text-blue-500"
                            : "text-muted-foreground hover:text-foreground"
                        }
                      >
                        New
                      </button>
                    </div>
                  }
                />
                <div className="rounded-lg border border-border p-4">
                  {guestMode === "existing" ? (
                    <Select
                      value={guestId}
                      onChange={(e) => setGuestId(e.target.value)}
                    >
                      <option value="">Choose a guest…</option>
                      {(guests.data ?? []).map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.last_name}, {g.first_name}
                          {g.email ? ` (${g.email})` : ""}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="First name" htmlFor="qc-first">
                        <Input
                          id="qc-first"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                        />
                      </Field>
                      <Field label="Last name" htmlFor="qc-last">
                        <Input
                          id="qc-last"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                        />
                      </Field>
                      <Field label="Email" htmlFor="qc-email">
                        <Input
                          id="qc-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </Field>
                      <Field label="Phone" htmlFor="qc-phone">
                        <Input
                          id="qc-phone"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                        />
                      </Field>
                    </div>
                  )}
                </div>
              </section>

              {/* Stay dates — shared by every room in the reservation */}
              <section className="space-y-3">
                <SectionHeader title="Stay dates" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Check-in" htmlFor="qc-ci">
                    <Input
                      id="qc-ci"
                      type="date"
                      value={checkIn}
                      onChange={(e) => onDates(e.target.value, checkOut)}
                    />
                  </Field>
                  <Field label="Check-out" htmlFor="qc-co">
                    <Input
                      id="qc-co"
                      type="date"
                      value={checkOut}
                      onChange={(e) => onDates(checkIn, e.target.value)}
                    />
                  </Field>
                </div>
                {checkIn && checkOut && !validDates && (
                  <p className="text-sm text-destructive">
                    Check-out must be after check-in.
                  </p>
                )}
              </section>

              {/* Rooms */}
              <section className="space-y-3">
                <SectionHeader title="Rooms" />
                {lines.length === 0 && (
                  <p className="text-sm text-muted-foreground">No rooms added.</p>
                )}
                {lines.map((line) => {
                  const r = roomById.get(line.roomId);
                  const plans = plansForRoom(line.roomId);
                  return (
                    <div
                      key={line.key}
                      className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-4"
                    >
                      <div className="min-w-[6rem] flex-1">
                        <div className="text-sm font-semibold">
                          Room {r?.room_number}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {r?.room_type_name}
                        </div>
                      </div>
                      <div className="w-40">
                        <Field label="Rate plan" htmlFor={`plan-${line.key}`}>
                          <Select
                            id={`plan-${line.key}`}
                            value={line.ratePlanId}
                            onChange={(e) =>
                              setLinePlan(line.key, e.target.value)
                            }
                          >
                            <option value="">No plan</option>
                            {plans.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                      <div className="w-24">
                        <Field label="Rate" htmlFor={`rate-${line.key}`}>
                          <Input
                            id={`rate-${line.key}`}
                            type="number"
                            min={0}
                            step="0.01"
                            value={centsToInput(line.rateCents)}
                            onChange={(e) =>
                              setLineRate(line.key, e.target.value)
                            }
                          />
                        </Field>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(line.key)}
                        aria-label="Remove room"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  );
                })}

                {addableRooms.length > 0 ? (
                  <Select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) addRoom(e.target.value);
                    }}
                  >
                    <option value="">+ Add another room…</option>
                    {addableRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        Room {r.room_number} · {r.room_type_name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    All available rooms have been added.
                  </p>
                )}
              </section>
            </div>

            {/* Booking summary — live totals for the new reservation */}
            <aside>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <SectionHeader title="Booking summary" />
                <dl className="mt-3 space-y-2.5 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-muted-foreground">Nights</dt>
                    <dd className="font-semibold tabular-nums">
                      {validDates ? n : 0}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-muted-foreground">Rooms</dt>
                    <dd className="font-semibold tabular-nums">{lines.length}</dd>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-border pt-3">
                    <dt className="font-semibold text-foreground">Total</dt>
                    <dd className="text-xl font-bold tabular-nums">
                      {formatMoney(total)}
                    </dd>
                  </div>
                </dl>
              </div>
            </aside>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
      </form>
    </Dialog>
  );
}

// ── Reservation detail ───────────────────────────────────────────────
// Opened from a timeline bar; shows the whole booking — every room under
// the guest — with per-room status controls and notes.
export function ReservationDetailDialog({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error } = useReservation(id);
  const [adding, setAdding] = useState(false);

  // Overall stay window + total, derived from the per-room dates/rates (our
  // model keeps dates on each room, not the reservation folder).
  const checkIns = data ? data.rooms.map((r) => r.check_in).sort() : [];
  const checkOuts = data ? data.rooms.map((r) => r.check_out).sort() : [];
  const rangeIn = checkIns[0];
  const rangeOut = checkOuts[checkOuts.length - 1];
  const stayNights = rangeIn && rangeOut ? nights(rangeIn, rangeOut) : 0;
  const roomsTotalCents = data
    ? (data.total_amount_cents ??
      data.rooms.reduce((s, r) => s + r.rate_cents, 0))
    : 0;
  const statuses = data ? [...new Set(data.rooms.map((r) => r.status))] : [];

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        data ? `${data.guest_first_name} ${data.guest_last_name}` : "Reservation"
      }
      description={
        data
          ? `Booking ${data.booking_ref} · ${data.source.replace(/_/g, " ")}`
          : undefined
      }
      className="max-w-5xl"
      headerAccent
      footer={
        data ? (
          <Link
            to={`/reservations/${data.id}`}
            onClick={onClose}
            className="text-sm font-medium text-blue-500 hover:underline"
          >
            Open full page →
          </Link>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="py-8">
          <CenteredSpinner label="Loading…" />
        </div>
      ) : isError || !data ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {isError ? (error as Error).message : "Reservation not found."}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overall stay · aggregate status · reservation id */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-muted/40 px-4 py-3">
            <div className="flex items-center gap-3">
              {statuses.length === 1 ? (
                <StatusBadge status={statuses[0]} />
              ) : (
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Mixed statuses
                </span>
              )}
              {rangeIn && rangeOut && (
                <span className="text-sm text-muted-foreground">
                  {formatDate(rangeIn)} → {formatDate(rangeOut)} · {stayNights}{" "}
                  night{stayNights === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <div className="select-all break-all text-[10px] text-muted-foreground">
              {data.id}
            </div>
          </div>

          {/* Rooms — full width so each fits on a single row */}
          <div className="space-y-3">
            <SectionHeader
              title="Rooms"
              action={
                !adding && (
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="text-sm font-medium text-blue-500 hover:underline"
                  >
                    + Add a room
                  </button>
                )
              }
            />
            {data.rooms.map((room) => (
              <DialogRoomRow
                key={room.id}
                room={room}
                reservationId={data.id}
                canRemove={data.rooms.length > 1}
              />
            ))}
            {adding && (
              <AddRoomForm
                reservationId={data.id}
                existingRoomIds={data.rooms.map((r) => r.room_id)}
                defaultCheckIn={toDateInput(data.rooms[0]?.check_in)}
                defaultCheckOut={toDateInput(data.rooms[0]?.check_out)}
                onDone={() => setAdding(false)}
              />
            )}
          </div>

          {/* Guest + notes on the left, money panel on the right */}
          <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
            <div className="space-y-6">
              <GuestSection guestId={data.guest_id} />
              <DialogNotes reservationId={data.id} notes={data.notes} />
            </div>
            <aside>
              <BookingSummary
                reservationId={data.id}
                totalCents={roomsTotalCents}
              />
            </aside>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// Right-hand money panel: total, what's been received, what's outstanding,
// and an inline record-payment form.
function BookingSummary({
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
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <SectionHeader title="Booking summary" />

      <dl className="mt-3 space-y-2.5 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">Total</dt>
          <dd className="text-base font-semibold tabular-nums text-foreground">
            {formatMoney(totalCents)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">Total received</dt>
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
        <ul className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          {(payments.data ?? []).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span className="capitalize">{p.method.replace(/_/g, " ")}</span>
              <span className="tabular-nums">{formatMoney(p.amount_cents)}</span>
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
          className="mt-4 w-full"
          onClick={() => setRecording(true)}
        >
          Record payment
        </Button>
      )}
    </div>
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
      className="mt-4 space-y-2 rounded-md border border-dashed border-border p-3"
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

// Editable guest details inside the reservation popup.
function GuestSection({ guestId }: { guestId: string }) {
  const guest = useGuest(guestId);
  const update = useUpdateGuest();
  const g = guest.data;

  // The form is always on screen (no read-only view) — seed it from the loaded
  // guest and keep it in sync if the record changes underneath.
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
    <section className="space-y-3">
      <SectionHeader title="Guest details" />
      {guest.isLoading ? (
        <div className="rounded-lg border border-border p-4">
          <Spinner />
        </div>
      ) : (
        <form
          onSubmit={save}
          className="space-y-3 rounded-lg border border-border p-4"
        >
          <div className="grid grid-cols-2 gap-3">
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
    </section>
  );
}

function DialogRoomRow({
  room,
  reservationId,
  canRemove,
}: {
  room: ReservationRoom;
  reservationId: string;
  canRemove: boolean;
}) {
  const statusMutation = useUpdateRoomStatus(reservationId);
  const detailsMutation = useUpdateRoomDetails(reservationId);
  const removeMutation = useRemoveReservationRoom(reservationId);

  // Dates + rate are always shown as editable fields (no separate view mode).
  // Seeded from the room and re-synced when the record changes underneath.
  const [checkIn, setCheckIn] = useState(toDateInput(room.check_in));
  const [checkOut, setCheckOut] = useState(toDateInput(room.check_out));
  const [rate, setRate] = useState(centsToInput(room.rate_cents));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCheckIn(toDateInput(room.check_in));
    setCheckOut(toDateInput(room.check_out));
    setRate(centsToInput(room.rate_cents));
  }, [room.check_in, room.check_out, room.rate_cents]);

  const dirty =
    checkIn !== toDateInput(room.check_in) ||
    checkOut !== toDateInput(room.check_out) ||
    rate !== centsToInput(room.rate_cents);

  function reset() {
    setCheckIn(toDateInput(room.check_in));
    setCheckOut(toDateInput(room.check_out));
    setRate(centsToInput(room.rate_cents));
    setError(null);
  }

  function save(e: FormEvent) {
    e.preventDefault();
    if (!checkIn || !checkOut || checkOut <= checkIn) {
      setError("Check-out must be after check-in.");
      return;
    }
    setError(null);
    detailsMutation.mutate(
      { roomId: room.id, checkIn, checkOut, rateCents: inputToCents(rate) },
      {
        onError: (err) =>
          setError(
            err instanceof ApiError ? err.message : "Couldn't save changes.",
          ),
      },
    );
  }

  return (
    <form
      onSubmit={save}
      className="space-y-3 rounded-lg border border-border p-4"
    >
      {/* One horizontal row: room · dates · rate · status · remove */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-14 shrink-0">
          <Label>Room</Label>
          <div className="mt-1.5 flex h-9 items-center text-sm font-semibold">
            {room.room_number ?? "—"}
          </div>
        </div>
        <div className="min-w-[9rem] flex-1">
          <Field label="Check-in" htmlFor={`ci-${room.id}`}>
            <Input
              id={`ci-${room.id}`}
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
            />
          </Field>
        </div>
        <div className="min-w-[9rem] flex-1">
          <Field label="Check-out" htmlFor={`co-${room.id}`}>
            <Input
              id={`co-${room.id}`}
              type="date"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-28">
          <Field label="Rate" htmlFor={`rate-${room.id}`}>
            <Input
              id={`rate-${room.id}`}
              type="number"
              min={0}
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-40">
          <Field label="Status" htmlFor={`st-${room.id}`}>
            <Select
              id={`st-${room.id}`}
              value={room.status}
              disabled={statusMutation.isPending}
              onChange={(e) =>
                statusMutation.mutate({
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
          </Field>
        </div>
        <div className="flex h-9 items-center gap-1">
          {statusMutation.isPending && <Spinner />}
          {canRemove && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove room"
              title="Remove room"
              disabled={removeMutation.isPending}
              onClick={() => removeMutation.mutate(room.id)}
            >
              {removeMutation.isPending ? (
                <Spinner />
              ) : (
                <Trash2 className="h-4 w-4 text-destructive" />
              )}
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Save/Reset only surface once something actually changed */}
      {dirty && (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reset}
            disabled={detailsMutation.isPending}
          >
            Reset
          </Button>
          <Button type="submit" size="sm" disabled={detailsMutation.isPending}>
            {detailsMutation.isPending && <Spinner />}
            Save
          </Button>
        </div>
      )}
    </form>
  );
}

// Add another room to an existing reservation. Availability-filtered, like
// the quick-create picker.
function AddRoomForm({
  reservationId,
  existingRoomIds,
  defaultCheckIn,
  defaultCheckOut,
  onDone,
}: {
  reservationId: string;
  existingRoomIds: string[];
  defaultCheckIn: string;
  defaultCheckOut: string;
  onDone: () => void;
}) {
  const rooms = useRooms();
  const ratePlans = useRatePlans();
  const add = useAddReservationRoom(reservationId);

  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);
  const [roomId, setRoomId] = useState("");
  const [ratePlanId, setRatePlanId] = useState("");
  const [rate, setRate] = useState("");
  const [rateEdited, setRateEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validDates = !!checkIn && !!checkOut && checkOut > checkIn;
  const n = validDates ? nights(checkIn, checkOut) : 0;
  const occupancy = useTimeline(
    validDates ? checkIn : "",
    validDates ? checkOut : "",
  );
  const occupied = new Set((occupancy.data ?? []).map((s) => s.room_id));

  const roomById = new Map((rooms.data ?? []).map((r) => [r.id, r]));
  const availableRooms = (rooms.data ?? []).filter(
    (r) =>
      r.status === "available" &&
      !existingRoomIds.includes(r.id) &&
      !occupied.has(r.id),
  );
  const plansForRoom = (rid: string) => {
    const r = roomById.get(rid);
    return r
      ? (ratePlans.data ?? []).filter((p) => p.room_type_id === r.room_type_id)
      : [];
  };
  const defaultRate = (planId: string, nn: number) => {
    const p = (ratePlans.data ?? []).find((x) => x.id === planId);
    return p ? p.base_rate_cents * Math.max(nn, 1) : 0;
  };

  function onRoomChange(rid: string) {
    setRoomId(rid);
    const pid = plansForRoom(rid)[0]?.id ?? "";
    setRatePlanId(pid);
    setRateEdited(false);
    setRate(centsToInput(defaultRate(pid, n)));
  }
  function onPlanChange(pid: string) {
    setRatePlanId(pid);
    setRateEdited(false);
    setRate(centsToInput(defaultRate(pid, n)));
  }
  function onDates(nin: string, nout: string) {
    setCheckIn(nin);
    setCheckOut(nout);
    const nn = nin && nout && nout > nin ? nights(nin, nout) : 0;
    if (!rateEdited && ratePlanId) {
      setRate(centsToInput(defaultRate(ratePlanId, nn)));
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validDates) return setError("Check-out must be after check-in.");
    if (!roomId) return setError("Select a room.");
    add.mutate(
      {
        roomId,
        ratePlanId: ratePlanId || undefined,
        rateCents: inputToCents(rate),
        checkIn,
        checkOut,
      },
      {
        onSuccess: () => onDone(),
        onError: (err) =>
          setError(
            err instanceof ApiError ? err.message : "Couldn't add the room.",
          ),
      },
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-md border border-dashed border-border p-3"
    >
      <div className="text-sm font-medium">Add a room</div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Check-in" htmlFor="ar-ci">
          <Input
            id="ar-ci"
            type="date"
            value={checkIn}
            onChange={(e) => onDates(e.target.value, checkOut)}
          />
        </Field>
        <Field label="Check-out" htmlFor="ar-co">
          <Input
            id="ar-co"
            type="date"
            value={checkOut}
            onChange={(e) => onDates(checkIn, e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Room" htmlFor="ar-room">
          <Select
            id="ar-room"
            value={roomId}
            onChange={(e) => onRoomChange(e.target.value)}
          >
            <option value="">Choose…</option>
            {availableRooms.map((r) => (
              <option key={r.id} value={r.id}>
                Room {r.room_number} · {r.room_type_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Rate plan" htmlFor="ar-plan">
          <Select
            id="ar-plan"
            value={ratePlanId}
            disabled={!roomId}
            onChange={(e) => onPlanChange(e.target.value)}
          >
            <option value="">No plan</option>
            {plansForRoom(roomId).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Rate" htmlFor="ar-rate">
          <Input
            id="ar-rate"
            type="number"
            min={0}
            step="0.01"
            value={rate}
            onChange={(e) => {
              setRate(e.target.value);
              setRateEdited(true);
            }}
          />
        </Field>
      </div>
      {validDates && availableRooms.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No rooms free for these dates.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDone}
          disabled={add.isPending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={add.isPending || !roomId || !validDates}
        >
          {add.isPending && <Spinner />}
          Add room
        </Button>
      </div>
    </form>
  );
}

function DialogNotes({
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
    <section className="space-y-3">
      <SectionHeader title="Notes" />
      <form onSubmit={onSubmit} className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
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

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="rounded-md bg-muted/50 p-3">
              <p className="text-sm">{note.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {note.user_email} · {new Date(note.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
