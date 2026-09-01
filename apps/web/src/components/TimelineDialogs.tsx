import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { Dialog, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input, Select } from "./ui/input";
import { Field } from "./ui/field";
import { StatusBadge } from "./StatusBadge";
import { CenteredSpinner, Spinner } from "./ui/spinner";
import { useGuests, useRatePlans, useRooms, useCreateGuest } from "../lib/setup";
import {
  useAddNote,
  useCreateReservation,
  useReservation,
  useTimeline,
  useUpdateRoomStatus,
} from "../lib/reservations";
import { ApiError } from "../lib/api";
import {
  centsToInput,
  formatDate,
  formatMoney,
  inputToCents,
  nights,
} from "../lib/format";
import type { Room, ReservationRoom, ReservationRoomStatus } from "../types";

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
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          {/* Guest */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Guest</span>
              <div className="flex gap-1 text-sm">
                <button
                  type="button"
                  onClick={() => setGuestMode("existing")}
                  className={
                    guestMode === "existing"
                      ? "font-medium text-primary"
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
                      ? "font-medium text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }
                >
                  New
                </button>
              </div>
            </div>
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

          {/* Dates (shared by every room in the reservation) */}
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

          {/* Rooms */}
          <div className="space-y-2">
            <span className="text-sm font-medium">Rooms</span>
            {lines.length === 0 && (
              <p className="text-sm text-muted-foreground">No rooms added.</p>
            )}
            {lines.map((line) => {
              const r = roomById.get(line.roomId);
              const plans = plansForRoom(line.roomId);
              return (
                <div
                  key={line.key}
                  className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3"
                >
                  <div className="min-w-[6rem] flex-1">
                    <div className="text-sm font-medium">
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
                        onChange={(e) => setLinePlan(line.key, e.target.value)}
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
                        onChange={(e) => setLineRate(line.key, e.target.value)}
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
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="font-semibold">{formatMoney(total)}</span>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting || !validDates || lines.length === 0}
          >
            {submitting && <Spinner />}
            Create reservation
          </Button>
        </DialogFooter>
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

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        data ? `${data.guest_first_name} ${data.guest_last_name}` : "Reservation"
      }
      description={
        data
          ? `${data.rooms.length} room${data.rooms.length === 1 ? "" : "s"} · ${formatMoney(
              data.total_amount_cents,
            )} · ${data.source.replace(/_/g, " ")}`
          : undefined
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
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {/* Booking reference + full id */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Booking
            </span>
            <div className="text-right">
              <div className="font-mono text-sm font-semibold text-foreground">
                {data.booking_ref}
              </div>
              <div className="select-all break-all font-mono text-[10px] text-muted-foreground">
                {data.id}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Rooms
            </div>
            {data.rooms.map((room) => (
              <DialogRoomRow key={room.id} room={room} reservationId={data.id} />
            ))}
          </div>

          <DialogNotes reservationId={data.id} notes={data.notes} />

          <div className="flex justify-end border-t border-border pt-3">
            <Link
              to={`/reservations/${data.id}`}
              onClick={onClose}
              className="text-sm font-medium text-primary hover:underline"
            >
              Open full page →
            </Link>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function DialogRoomRow({
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
          <span className="font-medium">Room {room.room_number ?? "—"}</span>
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
          className="w-36"
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
    <div className="space-y-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Notes
      </div>
      <form onSubmit={onSubmit} className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Add a note…"
          className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
    </div>
  );
}
