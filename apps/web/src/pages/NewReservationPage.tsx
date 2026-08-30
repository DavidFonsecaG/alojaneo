import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Trash2, BedDouble } from "lucide-react";
import { PageHeader } from "../components/Layout";
import { Button } from "../components/ui/button";
import { Input, Select } from "../components/ui/input";
import { Field } from "../components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { ErrorBox } from "../components/States";
import { CenteredSpinner, Spinner } from "../components/ui/spinner";
import { useGuests, useRooms, useRatePlans, useCreateGuest } from "../lib/setup";
import { useCreateReservation } from "../lib/reservations";
import { ApiError } from "../lib/api";
import {
  formatMoney,
  nights,
  centsToInput,
  inputToCents,
  toApiDate,
  parseApiDate,
} from "../lib/format";

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

export function NewReservationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const guests = useGuests();
  const rooms = useRooms();
  const ratePlans = useRatePlans();
  const createGuest = useCreateGuest();
  const createReservation = useCreateReservation();

  const [guestMode, setGuestMode] = useState<"existing" | "new">("existing");
  const [guestId, setGuestId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [lines, setLines] = useState<RoomLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const roomById = useMemo(
    () => new Map((rooms.data ?? []).map((r) => [r.id, r])),
    [rooms.data],
  );
  const planById = useMemo(
    () => new Map((ratePlans.data ?? []).map((p) => [p.id, p])),
    [ratePlans.data],
  );

  const validDates = !!checkIn && !!checkOut && checkOut > checkIn;
  const n = validDates ? nights(checkIn, checkOut) : 0;

  // Rooms that are in service and not already added to this reservation.
  const addableRooms = (rooms.data ?? []).filter(
    (r) => r.status === "available" && !lines.some((l) => l.roomId === r.id),
  );

  const total = lines.reduce((sum, l) => sum + l.rateCents, 0);

  const plansForRoom = (roomId: string) => {
    const room = roomById.get(roomId);
    if (!room) return [];
    return (ratePlans.data ?? []).filter(
      (p) => p.room_type_id === room.room_type_id,
    );
  };

  const defaultRate = (ratePlanId: string, nightsCount: number) => {
    const plan = planById.get(ratePlanId);
    if (!plan) return 0;
    return plan.base_rate_cents * Math.max(nightsCount, 1);
  };

  function addRoom(roomId: string) {
    const plans = plansForRoom(roomId);
    const ratePlanId = plans[0]?.id ?? "";
    setLines((prev) => [
      ...prev,
      { key: uid(), roomId, ratePlanId, rateCents: defaultRate(ratePlanId, n), rateEdited: false },
    ]);
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function setLinePlan(key: string, ratePlanId: string) {
    setLines((prev) =>
      prev.map((l) =>
        l.key === key
          ? { ...l, ratePlanId, rateCents: defaultRate(ratePlanId, n), rateEdited: false }
          : l,
      ),
    );
  }

  function setLineRate(key: string, value: string) {
    setLines((prev) =>
      prev.map((l) =>
        l.key === key ? { ...l, rateCents: inputToCents(value), rateEdited: true } : l,
      ),
    );
  }

  // Recompute auto (non-edited) rates when the stay length changes.
  function onDatesChange(nextIn: string, nextOut: string) {
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
  }

  // Prefill from the timeline's click-to-create: ?roomId&checkIn(&checkOut).
  // Runs once, after rooms + rate plans have loaded so the room line gets its
  // default rate plan and rate.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    const roomId = searchParams.get("roomId");
    const ci = searchParams.get("checkIn");
    if (!roomId || !ci) return;
    if (rooms.isLoading || ratePlans.isLoading) return;
    if (!roomById.has(roomId)) return; // unknown / other-hotel room id
    prefilledRef.current = true;
    const co =
      searchParams.get("checkOut") && searchParams.get("checkOut")! > ci
        ? searchParams.get("checkOut")!
        : toApiDate(new Date(parseApiDate(ci).getTime() + 86_400_000));
    onDatesChange(ci, co);
    addRoom(roomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms.isLoading, ratePlans.isLoading, searchParams]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validDates) return setError("Check-out must be after check-in.");
    if (lines.length === 0) return setError("Add at least one room.");
    if (guestMode === "existing" && !guestId)
      return setError("Select a guest, or add a new one.");

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
      const res = await createReservation.mutateAsync({
        guestId: resolvedGuestId,
        rooms: lines.map((l) => ({
          roomId: l.roomId,
          ratePlanId: l.ratePlanId || undefined,
          rateCents: l.rateCents,
          checkIn,
          checkOut,
        })),
      });
      navigate(`/reservations/${res.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to create reservation.",
      );
      setSubmitting(false);
    }
  }

  if (rooms.isLoading || guests.isLoading || ratePlans.isLoading) {
    return <CenteredSpinner label="Loading…" />;
  }

  const noRooms = (rooms.data ?? []).length === 0;

  return (
    <>
      <PageHeader
        title="New reservation"
        description="Create a booking for a guest"
      />

      <div className="p-8">
        <Link
          to="/reservations"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to reservations
        </Link>

        {noRooms ? (
          <div className="mt-4">
            <ErrorBox message="No rooms exist yet. Add rooms on the Rooms page before creating a reservation." />
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {/* Guest */}
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Guest</CardTitle>
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
                </CardHeader>
                <CardContent>
                  {guestMode === "existing" ? (
                    <Field label="Select guest" htmlFor="guest">
                      <Select
                        id="guest"
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
                    </Field>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="First name" htmlFor="nr-first">
                        <Input
                          id="nr-first"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          required={guestMode === "new"}
                        />
                      </Field>
                      <Field label="Last name" htmlFor="nr-last">
                        <Input
                          id="nr-last"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          required={guestMode === "new"}
                        />
                      </Field>
                      <Field label="Email" htmlFor="nr-email">
                        <Input
                          id="nr-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </Field>
                      <Field label="Phone" htmlFor="nr-phone">
                        <Input
                          id="nr-phone"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                        />
                      </Field>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Dates */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Dates</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Check-in" htmlFor="nr-ci">
                      <Input
                        id="nr-ci"
                        type="date"
                        value={checkIn}
                        onChange={(e) => onDatesChange(e.target.value, checkOut)}
                        required
                      />
                    </Field>
                    <Field label="Check-out" htmlFor="nr-co">
                      <Input
                        id="nr-co"
                        type="date"
                        value={checkOut}
                        onChange={(e) => onDatesChange(checkIn, e.target.value)}
                        required
                      />
                    </Field>
                  </div>
                  {checkIn && checkOut && !validDates && (
                    <p className="mt-2 text-sm text-destructive">
                      Check-out must be after check-in.
                    </p>
                  )}
                  {validDates && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {n} night{n === 1 ? "" : "s"}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Rooms */}
              <Card>
                <CardHeader className="flex-row items-center gap-2 space-y-0">
                  <BedDouble className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Rooms</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {lines.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No rooms added yet.
                    </p>
                  )}

                  {lines.map((line) => {
                    const room = roomById.get(line.roomId);
                    const plans = plansForRoom(line.roomId);
                    return (
                      <div
                        key={line.key}
                        className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3"
                      >
                        <div className="min-w-[7rem]">
                          <div className="text-sm font-medium">
                            Room {room?.room_number}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {room?.room_type_name}
                          </div>
                        </div>
                        <div className="w-44">
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
                        <div className="w-28">
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
                      <option value="">+ Add a room…</option>
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
                </CardContent>
              </Card>
            </div>

            {/* Summary */}
            <div className="lg:col-span-1">
              <Card className="sticky top-6">
                <CardHeader>
                  <CardTitle className="text-base">Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Rooms</span>
                    <span>{lines.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Nights</span>
                    <span>{n || "—"}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-3 font-medium">
                    <span>Total</span>
                    <span>{formatMoney(total)}</span>
                  </div>

                  {error && <ErrorBox message={error} />}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={submitting || lines.length === 0 || !validDates}
                  >
                    {submitting && <Spinner />}
                    Create reservation
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate("/reservations")}
                  >
                    Cancel
                  </Button>
                </CardContent>
              </Card>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
