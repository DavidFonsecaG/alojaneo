import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  BedDouble,
  CalendarDays,
  Check,
  CheckCircle2,
  ImageOff,
  Users,
} from "lucide-react";
import { Button, Card, Field, Input, Select, Spinner } from "../components/ui";
import { amenityLabel } from "../lib/amenities";
import { ApiError } from "../lib/api";
import { useAvailability, useCreateBooking, useHotel } from "../lib/booking";
import { hexToHslTriplet, readableForegroundTriplet } from "../lib/color";
import { formatDate, formatMoney, nights, toApiDate } from "../lib/format";
import { cn } from "../lib/utils";
import type {
  AvailabilityItem,
  AvailabilityRatePlan,
  BookingConfirmation,
  SearchParams,
} from "../types";

// One chosen room + rate plan in the cart. We allow several lines (including
// repeats of the same type) — the API books one room per line.
interface CartLine {
  key: string;
  item: AvailabilityItem;
  ratePlan: AvailabilityRatePlan;
}

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const today = new Date();
const tomorrow = new Date(today.getTime() + 86_400_000);

export function BookingPage() {
  const { hotelSlug } = useParams<{ hotelSlug: string }>();
  const [searchParams] = useSearchParams();

  // Deep-link support: a hotel (or the embed loader) can prefill and auto-run a
  // search via ?checkin=&checkout=&guests=. ?embed=1 drops the page chrome so
  // the engine sits cleanly inside an iframe on the hotel's own site.
  const embed = searchParams.get("embed") === "1";
  const qpCheckIn = searchParams.get("checkin") ?? "";
  const qpCheckOut = searchParams.get("checkout") ?? "";
  const qpGuests = Number(searchParams.get("guests")) || 0;

  // Search form (draft) vs. the submitted params that actually drive the query.
  const [checkIn, setCheckIn] = useState(qpCheckIn || toApiDate(today));
  const [checkOut, setCheckOut] = useState(qpCheckOut || toApiDate(tomorrow));
  const [guests, setGuests] = useState(qpGuests || 2);
  const [submitted, setSubmitted] = useState<SearchParams | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Show rooms immediately: run a search on mount using whatever is in the date
  // boxes (deep-linked values, or today→tomorrow / 2 guests by default) so the
  // guest lands on availability instead of an empty list.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    if (checkIn && checkOut && checkOut > checkIn) {
      setSubmitted({ checkIn, checkOut, guests });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When embedded in an iframe, report our content height to the parent so the
  // embed loader can size the frame (no inner scrollbar). Fires on every layout
  // change — results loading, step changes, confirmation.
  useEffect(() => {
    if (!embed || typeof window === "undefined" || window.parent === window) {
      return;
    }
    const post = () =>
      window.parent.postMessage(
        { type: "alojaneo:resize", height: document.documentElement.scrollHeight },
        "*",
      );
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [embed]);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [step, setStep] = useState<"browse" | "checkout">("browse");
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(
    null,
  );

  const availability = useAvailability(hotelSlug, submitted);
  const hotel = useHotel(hotelSlug);

  // Apply the hotel's accent color onto the theme tokens the buttons/links use.
  const accent = hotel.data?.accentColor ?? null;
  useEffect(() => {
    if (!accent) return;
    const triplet = hexToHslTriplet(accent);
    if (!triplet) return;
    const root = document.documentElement;
    root.style.setProperty("--primary", triplet);
    root.style.setProperty("--primary-foreground", readableForegroundTriplet(accent));
    root.style.setProperty("--ring", triplet);
    return () => {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--primary-foreground");
      root.style.removeProperty("--ring");
    };
  }, [accent]);

  const stayNights =
    submitted && submitted.checkOut > submitted.checkIn
      ? nights(submitted.checkIn, submitted.checkOut)
      : 0;

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!checkIn || !checkOut || checkOut <= checkIn) {
      setFormError("Check-out must be after check-in.");
      return;
    }
    setCart([]);
    setStep("browse");
    setSubmitted({ checkIn, checkOut, guests });
  }

  function addLine(item: AvailabilityItem, ratePlan: AvailabilityRatePlan) {
    setCart((prev) => [...prev, { key: uid(), item, ratePlan }]);
  }
  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  const total = cart.reduce(
    (sum, l) => sum + l.ratePlan.baseRateCents * Math.max(stayNights, 1),
    0,
  );
  const currency = cart[0]?.ratePlan.currency ?? "USD";

  if (hotel.isError) {
    return (
      <Shell hotelName={undefined} bannerUrl={null} embed={embed}>
        <Card className="p-8 text-center">
          <p className="font-medium">Hotel not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            We couldn't find a hotel at "{hotelSlug}". Check the link and try
            again.
          </p>
        </Card>
      </Shell>
    );
  }

  if (confirmation) {
    return (
      <Shell
        hotelName={hotel.data?.name}
        bannerUrl={hotel.data?.bannerUrl ?? null}
        embed={embed}
      >
        <ConfirmationView
          confirmation={confirmation}
          onReset={() => {
            setConfirmation(null);
            setCart([]);
            setStep("browse");
            setSubmitted(null);
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell
      hotelName={hotel.data?.name}
      bannerUrl={hotel.data?.bannerUrl ?? null}
      embed={embed}
    >
      <SearchBar
        checkIn={checkIn}
        checkOut={checkOut}
        guests={guests}
        error={formError}
        disabled={availability.isFetching}
        onCheckIn={setCheckIn}
        onCheckOut={setCheckOut}
        onGuests={setGuests}
        onSubmit={onSearch}
      />

      {!submitted ? (
        <EmptyPrompt />
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
          {/* Results */}
          <div className="space-y-4">
            {availability.isLoading ? (
              <div className="flex items-center gap-2 py-12 text-muted-foreground">
                <Spinner /> Searching availability…
              </div>
            ) : availability.isError ? (
              <Card className="p-6 text-sm text-destructive">
                {(availability.error as Error).message}
              </Card>
            ) : (availability.data ?? []).length === 0 ? (
              <Card className="p-8 text-center">
                <p className="font-medium">No rooms available</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Nothing matches {formatDate(submitted.checkIn)} –{" "}
                  {formatDate(submitted.checkOut)} for {submitted.guests} guest
                  {submitted.guests === 1 ? "" : "s"}. Try different dates.
                </p>
              </Card>
            ) : (
              (availability.data ?? []).map((item) => (
                <RoomTypeCard
                  key={item.roomType.id}
                  item={item}
                  nights={stayNights}
                  inCart={cart.filter((l) => l.item.roomType.id === item.roomType.id).length}
                  onAdd={(rp) => addLine(item, rp)}
                />
              ))
            )}
          </div>

          {/* Summary / checkout rail */}
          <aside className="lg:sticky lg:top-6">
            {step === "browse" ? (
              <CartSummary
                cart={cart}
                nights={stayNights}
                total={total}
                currency={currency}
                onRemove={removeLine}
                onCheckout={() => setStep("checkout")}
              />
            ) : (
              <CheckoutForm
                hotelSlug={hotelSlug}
                cart={cart}
                submitted={submitted}
                total={total}
                currency={currency}
                onBack={() => setStep("browse")}
                onConfirmed={setConfirmation}
              />
            )}
          </aside>
        </div>
      )}
    </Shell>
  );
}

function Shell({
  hotelName,
  bannerUrl,
  embed,
  children,
}: {
  hotelName: string | undefined;
  bannerUrl: string | null;
  embed?: boolean;
  children: React.ReactNode;
}) {
  const title = hotelName || "Book your stay";
  const showBanner = !embed && !!bannerUrl;
  return (
    <div className={embed ? "" : "min-h-screen"}>
      {/* The branded header + banner are the standalone-page chrome. When
          embedded on a hotel's own site, their page already provides those, so
          we drop them and let the engine fill the iframe. */}
      {!embed && (
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <BedDouble className="h-5 w-5" />
              </span>
              <div className="leading-tight">
                <div className="text-sm font-semibold">{title}</div>
                <div className="text-xs text-muted-foreground">
                  Direct booking
                </div>
              </div>
            </div>
            <Link
              to="/"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Change hotel
            </Link>
          </div>
        </header>
      )}

      {showBanner && (
        <div className="w-full bg-muted">
          <img
            src={bannerUrl!}
            alt={title}
            className="h-52 w-full object-cover sm:h-64"
          />
        </div>
      )}

      {/* When a banner is present the content floats up to overlap its lower
          edge (the first card straddles the seam), matching how hotel booking
          pages usually present their search box. */}
      <main
        className={cn(
          "mx-auto max-w-5xl px-4",
          embed ? "py-4" : showBanner ? "relative z-10 -mt-12 pb-10" : "py-6",
        )}
      >
        {children}
      </main>
    </div>
  );
}

function SearchBar({
  checkIn,
  checkOut,
  guests,
  error,
  disabled,
  onCheckIn,
  onCheckOut,
  onGuests,
  onSubmit,
}: {
  checkIn: string;
  checkOut: string;
  guests: number;
  error: string | null;
  disabled: boolean;
  onCheckIn: (v: string) => void;
  onCheckOut: (v: string) => void;
  onGuests: (v: number) => void;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <Card className="p-4">
      <form
        onSubmit={onSubmit}
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
      >
        <Field label="Check-in" htmlFor="ci">
          <Input
            id="ci"
            type="date"
            value={checkIn}
            min={toApiDate(today)}
            onChange={(e) => onCheckIn(e.target.value)}
          />
        </Field>
        <Field label="Check-out" htmlFor="co">
          <Input
            id="co"
            type="date"
            value={checkOut}
            min={checkIn}
            onChange={(e) => onCheckOut(e.target.value)}
          />
        </Field>
        <Field label="Guests" htmlFor="g">
          <Select
            id="g"
            className="sm:w-24"
            value={guests}
            onChange={(e) => onGuests(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" size="md" disabled={disabled}>
          {disabled && <Spinner />}
          Search
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </Card>
  );
}

function EmptyPrompt() {
  return (
    <div className="mt-16 flex flex-col items-center text-center text-muted-foreground">
      <CalendarDays className="h-10 w-10" />
      <p className="mt-3 text-sm">
        Pick your dates and number of guests to see available rooms.
      </p>
    </div>
  );
}

function RoomTypeCard({
  item,
  nights: stayNights,
  inCart,
  onAdd,
}: {
  item: AvailabilityItem;
  nights: number;
  inCart: number;
  onAdd: (ratePlan: AvailabilityRatePlan) => void;
}) {
  const { roomType, availableCount, ratePlans } = item;
  const remaining = availableCount - inCart;

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-0 sm:grid-cols-[16rem_1fr]">
        <PhotoGallery photos={roomType.photos} alt={roomType.name} />

        <div className="flex flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">
                {roomType.name}
              </h3>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                Sleeps {roomType.maxOccupancy}
                <span aria-hidden>·</span>
                {remaining > 0 ? (
                  <span>
                    {remaining} room{remaining === 1 ? "" : "s"} left
                  </span>
                ) : (
                  <span className="text-destructive">Fully selected</span>
                )}
              </div>
            </div>
          </div>

          {roomType.description && (
            <p className="mt-2 text-sm text-muted-foreground">
              {roomType.description}
            </p>
          )}

          {roomType.amenities.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {roomType.amenities.map((a) => (
                <li
                  key={a}
                  className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {amenityLabel(a)}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 space-y-2 border-t border-border pt-4">
            {ratePlans.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No online rates for these dates.
              </p>
            ) : (
              ratePlans.map((rp) => (
                <div
                  key={rp.id}
                  className="flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{rp.name}</div>
                    {rp.cancellationPolicy && (
                      <div className="text-xs text-muted-foreground">
                        {rp.cancellationPolicy}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums">
                        {formatMoney(rp.baseRateCents, rp.currency)}
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          / night
                        </span>
                      </div>
                      {stayNights > 0 && (
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {formatMoney(rp.baseRateCents * stayNights, rp.currency)}{" "}
                          total
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={remaining <= 0}
                      onClick={() => onAdd(rp)}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function PhotoGallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [active, setActive] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="flex min-h-[10rem] items-center justify-center bg-muted text-muted-foreground">
        <ImageOff className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 bg-muted p-1.5">
      <img
        src={photos[active]}
        alt={alt}
        className="h-40 w-full rounded-2xl object-cover sm:h-full sm:min-h-[10rem]"
      />
      {photos.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto">
          {photos.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={
                "h-10 w-14 shrink-0 overflow-hidden rounded-lg ring-2 ring-offset-1 " +
                (i === active ? "ring-primary" : "ring-transparent")
              }
            >
              <img
                src={p}
                alt=""
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CartSummary({
  cart,
  nights: stayNights,
  total,
  currency,
  onRemove,
  onCheckout,
}: {
  cart: CartLine[];
  nights: number;
  total: number;
  currency: string;
  onRemove: (key: string) => void;
  onCheckout: () => void;
}) {
  return (
    <Card className="p-5">
      <h3 className="text-base font-semibold tracking-tight">Your stay</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {stayNights} night{stayNights === 1 ? "" : "s"}
      </p>

      {cart.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No rooms selected yet. Add a room to continue.
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-3">
            {cart.map((l) => (
              <li key={l.key} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {l.item.roomType.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {l.ratePlan.name} ·{" "}
                    {formatMoney(
                      l.ratePlan.baseRateCents * Math.max(stayNights, 1),
                      currency,
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(l.key)}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-xl font-bold tabular-nums">
              {formatMoney(total, currency)}
            </span>
          </div>

          <Button
            type="button"
            size="lg"
            className="mt-4 w-full"
            onClick={onCheckout}
          >
            Continue to guest details
          </Button>
        </>
      )}
    </Card>
  );
}

function CheckoutForm({
  hotelSlug,
  cart,
  submitted,
  total,
  currency,
  onBack,
  onConfirmed,
}: {
  hotelSlug: string | undefined;
  cart: CartLine[];
  submitted: SearchParams;
  total: number;
  currency: string;
  onBack: () => void;
  onConfirmed: (c: BookingConfirmation) => void;
}) {
  const create = useCreateBooking(hotelSlug);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    create.mutate(
      {
        guest: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
        },
        rooms: cart.map((l) => ({
          roomTypeId: l.item.roomType.id,
          ratePlanId: l.ratePlan.id,
        })),
        checkIn: submitted.checkIn,
        checkOut: submitted.checkOut,
      },
      {
        onSuccess: onConfirmed,
        onError: (err) =>
          setError(
            err instanceof ApiError
              ? err.message
              : "Couldn't complete the booking. Please try again.",
          ),
      },
    );
  }

  return (
    <Card className="p-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to rooms
      </button>

      <h3 className="mt-2 text-base font-semibold tracking-tight">
        Guest details
      </h3>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" htmlFor="gf">
            <Input
              id="gf"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </Field>
          <Field label="Last name" htmlFor="gl">
            <Input
              id="gl"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Email" htmlFor="ge">
          <Input
            id="ge"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Phone (optional)" htmlFor="gp">
          <Input
            id="gp"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>

        <div className="flex items-baseline justify-between border-t border-border pt-3">
          <span className="text-sm font-semibold">Total</span>
          <span className="text-xl font-bold tabular-nums">
            {formatMoney(total, currency)}
          </span>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={create.isPending}
        >
          {create.isPending && <Spinner />}
          Confirm booking
        </Button>
      </form>
    </Card>
  );
}

function ConfirmationView({
  confirmation,
  onReset,
}: {
  confirmation: BookingConfirmation;
  onReset: () => void;
}) {
  const c = confirmation;
  const stayNights = nights(c.checkIn, c.checkOut);

  return (
    <div className="mx-auto max-w-md">
      <Card className="p-8 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-7 w-7" />
        </span>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight">
          Booking confirmed
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your stay at {c.hotelName} is reserved under {c.guest.email}.
        </p>

        <dl className="mt-6 space-y-2.5 rounded-2xl bg-muted/50 p-4 text-left text-sm">
          <Row label="Hotel" value={c.hotelName} />
          <Row
            label="Guest"
            value={`${c.guest.firstName} ${c.guest.lastName}`}
          />
          <Row label="Check-in" value={formatDate(c.checkIn)} />
          <Row label="Check-out" value={formatDate(c.checkOut)} />
          <Row
            label="Rooms"
            value={`${c.rooms.length} · ${stayNights} night${stayNights === 1 ? "" : "s"}`}
          />
          <div className="flex items-center justify-between border-t border-border pt-2.5">
            <dt className="font-semibold">Total</dt>
            <dd className="text-lg font-bold tabular-nums">
              {formatMoney(c.totalAmountCents, c.currency)}
            </dd>
          </div>
        </dl>

        <Button
          type="button"
          variant="outline"
          className="mt-6"
          onClick={onReset}
        >
          <Check className="h-4 w-4" />
          Book another stay
        </Button>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
