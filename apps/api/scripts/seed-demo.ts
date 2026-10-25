// Re-runnable demo seed for the "hotel-demo" property.
//
// Anchors a realistic spread of reservations around *today* (arrivals,
// departures, in-house, upcoming, past, one cancelled) plus matching payments,
// so the dashboard and calendar always show live activity no matter the date.
// It tags its own rows (external_reservation_id = 'seed') and clears that batch
// first, so running it again simply re-centres the demo on the current day
// without touching real data.
//
//   pnpm --filter @alojaneo/api seed:demo
import "../src/env.js";
import { sqlUnscoped, withTenant } from "../src/db.js";

const SLUG = "hotel-demo";
const SENTINEL = "seed"; // external_reservation_id tag for this re-runnable batch

const [hotel] = await sqlUnscoped`select id from hotels where slug = ${SLUG}`;
if (!hotel) {
  console.error(`Hotel "${SLUG}" not found — nothing to seed.`);
  process.exit(1);
}
const hotelId = hotel.id as string;

// Anchor on the real current date so re-running re-centres the demo on "today".
const today = new Date();
today.setHours(0, 0, 0, 0);
// Local YYYY-MM-DD (no toISOString, which would shift the day in +UTC zones).
const iso = (offsetDays: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const todayStr = iso(0);
// Whole-day offset of a DATE (Date or 'YYYY-MM-DD') from today, via UTC midnight.
function offsetOf(dateLike: Date | string): number {
  const s =
    dateLike instanceof Date
      ? dateLike.toISOString().slice(0, 10)
      : String(dateLike).slice(0, 10);
  const u = (x: string) =>
    Date.UTC(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10));
  return Math.round((u(s) - u(todayStr)) / 86_400_000);
}

// Rooms / rate plan / guests live behind RLS, so read them with tenant context.
const { rooms, rate, guests } = await withTenant(hotelId, async (tx) => {
  const rooms = await tx`select id, room_number from rooms order by room_number`;
  const [rate] = await tx`
    select id, base_rate_cents from rate_plans order by created_at limit 1`;
  const guests = await tx`select id from guests order by created_at`;
  return { rooms, rate, guests };
});
if (!rooms.length || !rate || !guests.length) {
  console.error("Demo hotel is missing rooms, a rate plan or guests.");
  process.exit(1);
}

// Clear the previous seed batch so this script is safe to run repeatedly.
const cleared = await withTenant(hotelId, async (tx) => {
  const rows = await tx`
    select count(*)::int n from reservations where external_reservation_id = ${SENTINEL}`;
  await tx`
    delete from reservation_rooms where reservation_id in (
      select id from reservations where external_reservation_id = ${SENTINEL}
    )`;
  await tx`delete from reservations where external_reservation_id = ${SENTINEL}`;
  return rows[0].n as number;
});

// [checkInOffset, checkOutOffset, status, source] — offsets in days from today.
type Spec = [number, number, string, string];
const specs: Spec[] = [
  // Past stays (already departed)
  [-7, -4, "checked_out", "direct_booking"],
  [-6, -3, "checked_out", "manual"],
  [-5, -2, "checked_out", "direct_booking"],
  // In-house right now
  [-3, 2, "checked_in", "direct_booking"],
  [-2, 3, "checked_in", "direct_booking"],
  [-2, 1, "checked_in", "manual"],
  [-1, 4, "checked_in", "direct_booking"],
  // Departing today
  [-3, 0, "checked_in", "direct_booking"],
  [-2, 0, "checked_in", "direct_booking"],
  // Arriving today
  [0, 2, "confirmed", "direct_booking"],
  [0, 3, "confirmed", "manual"],
  [0, 1, "confirmed", "direct_booking"],
  // Upcoming
  [1, 4, "confirmed", "direct_booking"],
  [2, 5, "confirmed", "direct_booking"],
  [3, 6, "confirmed", "manual"],
  [5, 8, "confirmed", "direct_booking"],
  [7, 10, "confirmed", "direct_booking"],
  // One cancelled (shows the status everywhere it's handled)
  [1, 3, "cancelled", "direct_booking"],
];

// Greedy room assignment that never double-books: an active stay only takes a
// room whose other active stays don't overlap it (half-open [in, out), so a
// same-day checkout/checkin handoff is fine) — mirrors the DB's exclusion
// constraint. Cancelled stays release the room, so they can go anywhere.
const occupied: [number, number][][] = rooms.map(() => []);

// Pre-load the intervals of *existing* real stays on each room (as day offsets)
// so the seed never collides with reservations that are already there.
const roomIndex = new Map<string, number>(
  rooms.map((r, i) => [r.id as string, i]),
);
const existing = await withTenant(hotelId, (tx) =>
  tx`select room_id, check_in, check_out from reservation_rooms
     where status in ('confirmed', 'checked_in', 'checked_out')`,
);
for (const e of existing) {
  const idx = roomIndex.get(e.room_id as string);
  if (idx !== undefined) {
    occupied[idx].push([offsetOf(e.check_in), offsetOf(e.check_out)]);
  }
}
const overlaps = (a0: number, a1: number, b0: number, b1: number) =>
  a0 < b1 && b0 < a1;
function pickRoom(inO: number, outO: number, active: boolean): number {
  for (let i = 0; i < rooms.length; i++) {
    if (!active) return i;
    if (occupied[i].every(([s, e]) => !overlaps(inO, outO, s, e))) {
      occupied[i].push([inO, outO]);
      return i;
    }
  }
  return -1;
}

let created = 0;
for (let i = 0; i < specs.length; i++) {
  const [inO, outO, status, source] = specs[i];
  const active = status !== "cancelled" && status !== "no_show";
  const ri = pickRoom(inO, outO, active);
  if (ri < 0) {
    console.warn("No free room for", specs[i], "— skipped.");
    continue;
  }
  const room = rooms[ri];
  const guestId = guests[i % guests.length].id;
  const nights = Math.max(1, outO - inO);
  const rateCents = rate.base_rate_cents as number;
  const total = rateCents * nights;

  await withTenant(hotelId, async (tx) => {
    // Per-hotel booking counter (same path the real create flows use).
    const [{ booking_seq }] = await tx`
      update hotels set booking_seq = booking_seq + 1
      where id = ${hotelId} returning booking_seq`;
    const [res] = await tx`
      insert into reservations
        (hotel_id, guest_id, booking_ref, total_amount_cents, source, external_reservation_id)
      values
        (${hotelId}, ${guestId}, ${`BK-${booking_seq}`}, ${total}, ${source}, ${SENTINEL})
      returning id`;
    await tx`
      insert into reservation_rooms
        (reservation_id, room_id, rate_plan_id, rate_cents, check_in, check_out, status)
      values
        (${res.id}, ${room.id}, ${rate.id}, ${rateCents}, ${iso(inO)}, ${iso(outO)}, ${status})`;

    // A matching payment, so the ledger + "revenue today" are populated.
    // Stays that transact today (arriving/departing) are dated now; others are
    // backdated to their check-in so the history reads realistically.
    if (active) {
      const paysToday = inO === 0 || outO === 0;
      const paid =
        status === "confirmed" ? Math.round(total / 2) : total; // deposit vs. settled
      const method = source === "manual" ? "cash" : "card";
      await tx`
        insert into payments
          (hotel_id, reservation_id, amount_cents, currency, method, provider, status, created_at)
        values
          (${hotelId}, ${res.id}, ${paid}, 'USD', ${method}, 'manual', 'completed',
           ${paysToday ? tx`now()` : tx`${iso(inO)}::timestamptz`})`;
    }
  });
  created++;
}

console.log(
  JSON.stringify(
    { hotel: SLUG, today: iso(0), clearedPreviousSeed: cleared, created },
    null,
    2,
  ),
);
process.exit(0);
