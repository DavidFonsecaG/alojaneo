import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  BedDouble,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Lock,
  Minus,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button, Card, Field, Input, Select, Spinner } from "../components/ui";
import { DateRangePicker } from "../components/DateRangePicker";
import { amenityLabel } from "../lib/amenities";
import { ApiError } from "../lib/api";
import { tokenizeCard } from "../lib/kushki";
import {
  confirmPaymentRequest,
  depositCents,
  useAvailability,
  useCreateBooking,
  useHotel,
} from "../lib/booking";
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
// Midnight today — the earliest selectable date in the range picker.
const minDate = new Date(
  today.getFullYear(),
  today.getMonth(),
  today.getDate(),
);

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

  // Return hop from a gateway's hosted checkout (?pay_return=<reservationId>):
  // confirm the payment and show the outcome.
  const payReturn = searchParams.get("pay_return");
  const [returnState, setReturnState] = useState<{
    status: "confirming" | "done" | "failed";
    bookingRef?: string;
    error?: string;
  }>({ status: "confirming" });
  useEffect(() => {
    if (!payReturn) return;
    let alive = true;
    confirmPaymentRequest(hotelSlug, {
      reservationId: payReturn,
      clientTxId:
        searchParams.get("clientTxId") ??
        searchParams.get("clientTransactionId") ??
        "",
      providerTxId: searchParams.get("id") ?? undefined,
    })
      .then((r) => {
        if (alive) setReturnState({ status: "done", bookingRef: r.bookingRef });
      })
      .catch((e) => {
        if (alive)
          setReturnState({
            status: "failed",
            error:
              e instanceof ApiError
                ? e.message
                : "Payment could not be confirmed.",
          });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payReturn, hotelSlug]);

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
  // Remove one line matching a room type + rate plan (the stepper's minus).
  function removeOneByRate(roomTypeId: string, ratePlanId: string) {
    setCart((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (
          prev[i].item.roomType.id === roomTypeId &&
          prev[i].ratePlan.id === ratePlanId
        ) {
          return prev.filter((_, j) => j !== i);
        }
      }
      return prev;
    });
  }

  // On mobile the summary/checkout rail sits below the room list, so the sticky
  // bottom bar scrolls to it when the guest continues.
  const checkoutRef = useRef<HTMLDivElement>(null);
  function goToCheckout() {
    setStep("checkout");
    requestAnimationFrame(() =>
      checkoutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  const total = cart.reduce(
    (sum, l) => sum + l.ratePlan.baseRateCents * Math.max(stayNights, 1),
    0,
  );
  const currency = cart[0]?.ratePlan.currency ?? "USD";
  const payNow = depositCents(hotel.data?.deposit, total);

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

  if (payReturn) {
    return (
      <Shell
        hotelName={hotel.data?.name}
        bannerUrl={hotel.data?.bannerUrl ?? null}
        bannerPosition={hotel.data?.bannerPosition ?? 50}
        embed={embed}
      >
        <PaymentReturnView
          status={returnState.status}
          bookingRef={returnState.bookingRef}
          error={returnState.error}
          slug={hotelSlug}
        />
      </Shell>
    );
  }

  if (confirmation) {
    return (
      <Shell
        hotelName={hotel.data?.name}
        bannerUrl={hotel.data?.bannerUrl ?? null}
        bannerPosition={hotel.data?.bannerPosition ?? 50}
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
      bannerPosition={hotel.data?.bannerPosition ?? 50}
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
        <div
          className={cn(
            "mt-6 grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start",
            // Reserve room for the mobile sticky bar so it never covers content.
            !embed && step === "browse" && cart.length > 0 && "pb-24 lg:pb-0",
          )}
        >
          {/* Results */}
          <div className="space-y-4">
            {availability.isLoading ? (
              <>
                <RoomCardSkeleton />
                <RoomCardSkeleton />
                <RoomCardSkeleton />
              </>
            ) : availability.isError ? (
              <Card className="p-6 text-sm text-destructive">
                {(availability.error as Error).message}
              </Card>
            ) : (availability.data ?? []).length === 0 ? (
              <Card className="p-8 text-center">
                <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-medium">No rooms available</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Nothing matches {formatDate(submitted.checkIn)} –{" "}
                  {formatDate(submitted.checkOut)} for {submitted.guests} guest
                  {submitted.guests === 1 ? "" : "s"}.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try shifting your dates
                  {submitted.guests > 1 ? " or lowering the guest count" : ""}.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  onClick={() =>
                    window.scrollTo({ top: 0, behavior: "smooth" })
                  }
                >
                  Adjust your search
                </Button>
              </Card>
            ) : (
              (availability.data ?? []).map((item) => (
                <RoomTypeCard
                  key={item.roomType.id}
                  item={item}
                  nights={stayNights}
                  lines={cart.filter(
                    (l) => l.item.roomType.id === item.roomType.id,
                  )}
                  onAdd={(rp) => addLine(item, rp)}
                  onRemoveOne={(rp) => removeOneByRate(item.roomType.id, rp.id)}
                />
              ))
            )}
          </div>

          {/* Summary / checkout rail */}
          <aside ref={checkoutRef} className="lg:sticky lg:top-6">
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
                payNow={payNow}
                currency={currency}
                payment={hotel.data?.payment}
                onBack={() => setStep("browse")}
                onConfirmed={(c) => {
                  // A gateway that needs a hosted-checkout hop sends us a URL;
                  // otherwise show the confirmation inline.
                  if (c.redirectUrl) window.location.href = c.redirectUrl;
                  else setConfirmation(c);
                }}
              />
            )}
          </aside>

          {/* Mobile sticky action bar — on small screens the summary rail is
              below the whole room list, so surface the total + CTA here. */}
          {!embed && step === "browse" && cart.length > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 py-3 shadow-[0_-4px_12px_rgba(16,24,40,0.08)] backdrop-blur lg:hidden">
              <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
                <div className="leading-tight">
                  <div className="text-xs text-muted-foreground">
                    {cart.length} room{cart.length === 1 ? "" : "s"} ·{" "}
                    {stayNights} night{stayNights === 1 ? "" : "s"}
                  </div>
                  <div className="text-lg font-bold tabular-nums">
                    {formatMoney(total, currency)}
                  </div>
                </div>
                <Button type="button" size="lg" onClick={goToCheckout}>
                  Continue
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}

function Shell({
  hotelName,
  bannerUrl,
  bannerPosition = 50,
  embed,
  children,
}: {
  hotelName: string | undefined;
  bannerUrl: string | null;
  bannerPosition?: number;
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
        <header className="bg-primary text-primary-foreground">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary-foreground/15">
                <BedDouble className="h-5 w-5" />
              </span>
              <div className="leading-tight">
                <div className="text-sm font-semibold">{title}</div>
                <div className="text-xs text-primary-foreground/70">
                  Direct booking
                </div>
              </div>
            </div>
          </div>
        </header>
      )}

      {showBanner && (
        <div className="w-full bg-muted">
          <img
            src={bannerUrl!}
            alt={title}
            style={{ objectPosition: `center ${bannerPosition}%` }}
            className="h-52 w-full object-cover sm:h-64"
          />
        </div>
      )}

      {/* When a banner is present the content floats up to overlap its lower
          edge (the first card straddles the seam), matching how hotel booking
          pages usually present their search box. */}
      <main
        className={cn(
          "mx-auto max-w-7xl px-4",
          embed ? "py-4" : showBanner ? "relative z-10 -mt-12 pb-10" : "py-6",
        )}
      >
        {children}
      </main>

      {/* Co-branding: the page carries the hotel's own look (header, banner,
          accent); Alojaneo is credited discreetly in the footer. Dropped in
          embed mode, where the hotel's site owns the surrounding chrome. */}
      {!embed && (
        <footer className="mx-auto max-w-7xl px-4 pb-8 pt-4">
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <span>Powered by</span>
            <img
              src="/alojaneo-icon.svg"
              alt=""
              className="size-4 rounded"
            />
            <span className="font-brand font-extrabold tracking-[-0.02em] text-foreground">
              Alojaneo
            </span>
          </div>
        </footer>
      )}
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
    // Sticky so the dates/guests stay reachable while scrolling a long list.
    <Card className="sticky top-3 z-30 p-4">
      <form
        onSubmit={onSubmit}
        className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
      >
        <Field label="Dates">
          <DateRangePicker
            checkIn={checkIn}
            checkOut={checkOut}
            minDate={minDate}
            onChange={(ci, co) => {
              onCheckIn(ci);
              onCheckOut(co);
            }}
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
        <Button type="submit" size="md" className="px-8" disabled={disabled}>
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

// Rate plans store a free-text cancellation policy; tidy the common "free"
// value, leave anything else as the hotel wrote it.
function cancellationLabel(policy: string): string {
  return /^free$/i.test(policy.trim()) ? "Free cancellation" : policy;
}

// Placeholder that mirrors the room card while availability loads.
function RoomCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-0 sm:grid-cols-[18rem_1fr]">
        <div className="h-40 animate-pulse bg-muted sm:h-full sm:min-h-[12rem]" />
        <div className="flex animate-pulse flex-col gap-3 p-5">
          <div className="h-5 w-40 rounded bg-muted" />
          <div className="h-3 w-28 rounded bg-muted" />
          <div className="h-3 w-full rounded bg-muted" />
          <div className="h-3 w-4/5 rounded bg-muted" />
          <div className="mt-auto flex items-center justify-between border-t border-border pt-4">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-9 w-24 rounded-full bg-muted" />
          </div>
        </div>
      </div>
    </Card>
  );
}

function RoomTypeCard({
  item,
  nights: stayNights,
  lines,
  onAdd,
  onRemoveOne,
}: {
  item: AvailabilityItem;
  nights: number;
  lines: CartLine[];
  onAdd: (ratePlan: AvailabilityRatePlan) => void;
  onRemoveOne: (ratePlan: AvailabilityRatePlan) => void;
}) {
  const { roomType, availableCount, ratePlans } = item;
  const remaining = availableCount - lines.length;

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-0 sm:grid-cols-[18rem_1fr]">
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

          {/* Spacer keeps a minimum gap and eats any extra height, pinning the
              divider + rates to the bottom of the card so they line up with the
              bottom of the photo regardless of how much text sits above. */}
          <div className="min-h-4 grow" aria-hidden />

          <div className="space-y-2 border-t border-border pt-4">
            {ratePlans.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No online rates for these dates.
              </p>
            ) : (
              ratePlans.map((rp) => {
                const qty = lines.filter(
                  (l) => l.ratePlan.id === rp.id,
                ).length;
                return (
                  <div
                    key={rp.id}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 transition-colors",
                      qty > 0
                        ? "border-primary/40 bg-primary/5"
                        : "border-border",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{rp.name}</div>
                      {rp.cancellationPolicy && (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                          {cancellationLabel(rp.cancellationPolicy)}
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
                            {formatMoney(
                              rp.baseRateCents * stayNights,
                              rp.currency,
                            )}{" "}
                            total
                          </div>
                        )}
                      </div>
                      {qty > 0 ? (
                        // Selected → quantity stepper (clear "it's in your cart"
                        // feedback, and adjust without scrolling to the rail).
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label={`Remove one ${rp.name}`}
                            onClick={() => onRemoveOne(rp)}
                            className="flex size-9 items-center justify-center rounded-full border border-input text-foreground transition-colors hover:bg-muted"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-5 text-center text-sm font-semibold tabular-nums">
                            {qty}
                          </span>
                          <button
                            type="button"
                            aria-label={`Add one ${rp.name}`}
                            disabled={remaining <= 0}
                            onClick={() => onAdd(rp)}
                            className="flex size-9 items-center justify-center rounded-full border border-input text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          className="px-7"
                          disabled={remaining <= 0}
                          onClick={() => onAdd(rp)}
                        >
                          Add
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
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

  const many = photos.length > 1;
  const go = (dir: number) =>
    setActive((i) => (i + dir + photos.length) % photos.length);

  return (
    <div className="flex flex-col gap-1.5 bg-muted p-1.5">
      <div className="group relative">
        <img
          src={photos[active]}
          alt={many ? `${alt} — photo ${active + 1} of ${photos.length}` : alt}
          className="h-40 w-full rounded-2xl object-cover sm:h-full sm:min-h-[10rem]"
        />
        {many && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              onClick={() => go(-1)}
              className="absolute left-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity hover:bg-black/60 focus-visible:opacity-100 group-hover:opacity-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next photo"
              onClick={() => go(1)}
              className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity hover:bg-black/60 focus-visible:opacity-100 group-hover:opacity-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white">
              {active + 1}/{photos.length}
            </span>
          </>
        )}
      </div>
      {many && (
        <div className="flex gap-1.5 overflow-x-auto">
          {photos.map((p, i) => (
            <button
              key={i}
              type="button"
              aria-label={`View photo ${i + 1}`}
              aria-current={i === active ? "true" : undefined}
              onClick={() => setActive(i)}
              className={
                "h-10 w-14 shrink-0 overflow-hidden rounded-lg ring-2 ring-offset-1 " +
                (i === active ? "ring-primary" : "ring-transparent")
              }
            >
              <img src={p} alt="" className="h-full w-full object-cover" />
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
                  <div className="text-xs text-muted-foreground tabular-nums">
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
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {stayNights} night{stayNights === 1 ? "" : "s"} · no booking fees
          </p>

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
  payNow,
  currency,
  payment,
  onBack,
  onConfirmed,
}: {
  hotelSlug: string | undefined;
  cart: CartLine[];
  submitted: SearchParams;
  total: number;
  payNow: number;
  currency: string;
  payment?: {
    provider: string;
    publicKey: string | null;
    enabled: boolean;
    tokenRequired: boolean;
  };
  onBack: () => void;
  onConfirmed: (c: BookingConfirmation) => void;
}) {
  const create = useCreateBooking(hotelSlug);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const stayNights = nights(submitted.checkIn, submitted.checkOut);

  // Collect a card only when the hotel's gateway needs a token AND there's a
  // deposit to charge now.
  const needsCard = !!payment?.tokenRequired && payNow > 0;
  const [card, setCard] = useState({ name: "", number: "", exp: "", cvc: "" });
  const [tokenizing, setTokenizing] = useState(false);

  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const emailError = emailTouched && email.trim().length > 0 && !emailValid;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim() || !emailValid) {
      setEmailTouched(true);
      setError("Please enter your name and a valid email.");
      return;
    }

    // Tokenise the card client-side (the number never reaches our server).
    let paymentToken: string | undefined;
    if (needsCard) {
      const [mm, yyRaw] = card.exp.split("/").map((s) => s.trim());
      const digits = card.number.replace(/\s+/g, "");
      if (!card.name.trim() || digits.length < 12 || !mm || !yyRaw || !card.cvc.trim()) {
        setError("Please enter your card details.");
        return;
      }
      try {
        setTokenizing(true);
        paymentToken = await tokenizeCard({
          publicKey: payment!.publicKey ?? "",
          amountCents: payNow,
          currency,
          test: true, // TODO(sandbox): drive from the environment
          card: {
            name: card.name,
            number: digits,
            expiryMonth: mm.padStart(2, "0"),
            expiryYear: yyRaw.length === 4 ? yyRaw.slice(2) : yyRaw,
            cvc: card.cvc,
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Card couldn't be processed.");
        return;
      } finally {
        setTokenizing(false);
      }
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
        paymentToken,
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

      {/* Order summary — keep the rooms + dates in view while entering details. */}
      <div className="mt-3 rounded-2xl bg-muted/50 p-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
          {formatDate(submitted.checkIn)} → {formatDate(submitted.checkOut)}
          <span aria-hidden>·</span>
          {stayNights} night{stayNights === 1 ? "" : "s"}
        </div>
        <ul className="mt-2 space-y-1">
          {cart.map((l) => (
            <li
              key={l.key}
              className="flex items-baseline justify-between gap-2 text-sm"
            >
              <span className="min-w-0 truncate">
                {l.item.roomType.name}
                <span className="text-muted-foreground">
                  {" "}
                  · {l.ratePlan.name}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">
                {formatMoney(
                  l.ratePlan.baseRateCents * Math.max(stayNights, 1),
                  currency,
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" htmlFor="gf">
            <Input
              id="gf"
              value={firstName}
              required
              autoComplete="given-name"
              onChange={(e) => setFirstName(e.target.value)}
            />
          </Field>
          <Field label="Last name" htmlFor="gl">
            <Input
              id="gl"
              value={lastName}
              required
              autoComplete="family-name"
              onChange={(e) => setLastName(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Email" htmlFor="ge">
          <Input
            id="ge"
            type="email"
            value={email}
            required
            autoComplete="email"
            aria-invalid={emailError || undefined}
            onBlur={() => setEmailTouched(true)}
            onChange={(e) => setEmail(e.target.value)}
          />
          {emailError && (
            <p className="mt-1 text-xs text-destructive">
              Enter a valid email address.
            </p>
          )}
        </Field>
        <Field label="Phone (optional)" htmlFor="gp">
          <Input
            id="gp"
            type="tel"
            value={phone}
            autoComplete="tel"
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>

        {needsCard && (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              Card details
            </div>
            <Field label="Cardholder name" htmlFor="cc-name">
              <Input
                id="cc-name"
                autoComplete="cc-name"
                value={card.name}
                onChange={(e) => setCard((c) => ({ ...c, name: e.target.value }))}
                placeholder="Name on card"
              />
            </Field>
            <Field label="Card number" htmlFor="cc-num">
              <Input
                id="cc-num"
                inputMode="numeric"
                autoComplete="cc-number"
                value={card.number}
                onChange={(e) =>
                  setCard((c) => ({ ...c, number: e.target.value }))
                }
                placeholder="1234 5678 9012 3456"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Expiry (MM/YY)" htmlFor="cc-exp">
                <Input
                  id="cc-exp"
                  autoComplete="cc-exp"
                  value={card.exp}
                  onChange={(e) =>
                    setCard((c) => ({ ...c, exp: e.target.value }))
                  }
                  placeholder="MM/YY"
                />
              </Field>
              <Field label="CVC" htmlFor="cc-cvc">
                <Input
                  id="cc-cvc"
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  value={card.cvc}
                  onChange={(e) =>
                    setCard((c) => ({ ...c, cvc: e.target.value }))
                  }
                  placeholder="123"
                />
              </Field>
            </div>
          </div>
        )}

        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">
              Total · no booking fees
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {formatMoney(total, currency)}
            </span>
          </div>
          {payNow > 0 ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold">Pay now</span>
                <span className="text-xl font-bold tabular-nums">
                  {formatMoney(payNow, currency)}
                </span>
              </div>
              {total - payNow > 0 && (
                <p className="text-xs text-muted-foreground">
                  Balance of {formatMoney(total - payNow, currency)} due at the
                  property.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              No prepayment required — pay at the property.
            </p>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={create.isPending || tokenizing}
        >
          {(create.isPending || tokenizing) && <Spinner />}
          {tokenizing
            ? "Processing card…"
            : payNow > 0
              ? `Pay ${formatMoney(payNow, currency)} & confirm`
              : "Confirm booking"}
        </Button>

        {payNow > 0 && (
          <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3 shrink-0" />
            Secure payment · your details are encrypted
          </p>
        )}
      </form>
    </Card>
  );
}

// Build and download a calendar event for the stay (all-day, check-in →
// check-out). Self-contained .ics, no external service.
function downloadStayIcs(c: BookingConfirmation) {
  const day = (iso: string) => iso.slice(0, 10).replace(/-/g, "");
  const stamp =
    new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const esc = (s: string) =>
    s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Alojaneo//Booking//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${c.bookingRef || stamp}@alojaneo`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day(c.checkIn)}`,
    `DTEND;VALUE=DATE:${day(c.checkOut)}`,
    `SUMMARY:${esc(`Stay at ${c.hotelName}`)}`,
    `DESCRIPTION:${esc(`Booking ${c.bookingRef} · ${c.guest.firstName} ${c.guest.lastName}`)}`,
    `LOCATION:${esc(c.hotelName)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const url = URL.createObjectURL(
    new Blob([ics], { type: "text/calendar;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${c.bookingRef || "booking"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
          A confirmation has been sent to {c.guest.email}.
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
          <Row label="Booking ref" value={c.bookingRef} />
          <div className="flex items-center justify-between border-t border-border pt-2.5">
            <dt className="font-semibold">Total</dt>
            <dd className="text-lg font-bold tabular-nums">
              {formatMoney(c.totalAmountCents, c.currency)}
            </dd>
          </div>
          {c.payment.status === "completed" && (
            <>
              <div className="flex items-center justify-between">
                <dt className="text-emerald-600">Paid now</dt>
                <dd className="font-medium tabular-nums text-emerald-600">
                  {formatMoney(c.payment.amountCents, c.currency)}
                </dd>
              </div>
              {c.payment.balanceDueCents > 0 && (
                <Row
                  label="Balance at property"
                  value={formatMoney(c.payment.balanceDueCents, c.currency)}
                />
              )}
            </>
          )}
        </dl>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={() => downloadStayIcs(c)}>
            <CalendarPlus className="h-4 w-4" />
            Add to calendar
          </Button>
          <Button type="button" variant="outline" onClick={onReset}>
            <Check className="h-4 w-4" />
            Book another stay
          </Button>
        </div>
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

function PaymentReturnView({
  status,
  bookingRef,
  error,
  slug,
}: {
  status: "confirming" | "done" | "failed";
  bookingRef?: string;
  error?: string;
  slug: string | undefined;
}) {
  const home = () => {
    window.location.href = `/${slug ?? ""}`;
  };
  return (
    <div className="mx-auto max-w-md">
      <Card className="p-8 text-center">
        {status === "confirming" ? (
          <>
            <Spinner className="mx-auto h-6 w-6" />
            <p className="mt-3 text-sm text-muted-foreground">
              Confirming your payment…
            </p>
          </>
        ) : status === "done" ? (
          <>
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" />
            </span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight">
              Payment confirmed
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your booking {bookingRef} is all set — a confirmation is on its
              way.
            </p>
            <Button type="button" variant="outline" className="mt-6" onClick={home}>
              Book another stay
            </Button>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-semibold tracking-tight">
              Payment not completed
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {error ?? "The payment didn't go through."}
            </p>
            <Button type="button" variant="outline" className="mt-6" onClick={home}>
              Try again
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
