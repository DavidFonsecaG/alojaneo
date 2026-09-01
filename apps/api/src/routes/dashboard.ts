import type { FastifyInstance } from "fastify";
import { withTenant } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const isDate = (s: string | undefined): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

// "Today" comes from the client (its local date) so the dashboard agrees with
// the rest of the app; falls back to the server's UTC date.
const resolveToday = (q: { today?: string }) =>
  isDate(q.today) ? q.today : iso(new Date());

// Date range for the occupancy chart's Day / Week / Month toggle, anchored on
// the given day. UTC math keeps it aligned with the DATE columns.
function rangeFor(span: string, today: string): { from: string; to: string } {
  const base = new Date(`${today}T00:00:00Z`);
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const d = base.getUTCDate();
  if (span === "day") {
    const t = iso(new Date(Date.UTC(y, m, d)));
    return { from: t, to: t };
  }
  if (span === "month") {
    return {
      from: iso(new Date(Date.UTC(y, m, 1))),
      to: iso(new Date(Date.UTC(y, m + 1, 0))),
    };
  }
  // week: Monday → Sunday of the current week
  const dow = (new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7; // 0 = Monday
  return {
    from: iso(new Date(Date.UTC(y, m, d - dow))),
    to: iso(new Date(Date.UTC(y, m, d - dow + 6))),
  };
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // GET /dashboard — headline cards: room status, arrivals, activity feed.
  app.get("/dashboard", async (req) => {
    const today = resolveToday(req.query as { today?: string });

    return withTenant(req.hotelId, async (tx) => {
      const [counts] = await tx`
        select
          (select count(*)::int from rooms) as total_rooms,
          (select count(distinct rr.room_id)::int
             from reservation_rooms rr
             where rr.status not in ('cancelled', 'no_show')
               and rr.check_in <= ${today} and rr.check_out > ${today}
          ) as occupied_rooms
      `;
      const total = counts.total_rooms ?? 0;
      const occupied = counts.occupied_rooms ?? 0;

      const arrivingToday = await tx`
        select
          r.id as reservation_id,
          r.booking_ref,
          g.first_name,
          g.last_name,
          rr.check_in,
          rr.status,
          rm.room_number,
          rt.name as room_type_name
        from reservation_rooms rr
        join reservations r on r.id = rr.reservation_id
        join guests g on g.id = r.guest_id
        join rooms rm on rm.id = rr.room_id
        join room_types rt on rt.id = rm.room_type_id
        where rr.check_in = ${today}
          and rr.status not in ('cancelled', 'no_show')
        order by g.last_name, g.first_name
      `;

      const recentStatusEvents = await tx`
        select
          rsh.created_at,
          rsh.new_status,
          rm.room_number,
          g.first_name,
          g.last_name
        from reservation_status_history rsh
        join reservation_rooms rr on rr.id = rsh.reservation_room_id
        join rooms rm on rm.id = rr.room_id
        join reservations r on r.id = rr.reservation_id
        join guests g on g.id = r.guest_id
        order by rsh.created_at desc
        limit 8
      `;

      const recentBookings = await tx`
        select r.created_at, g.first_name, g.last_name
        from reservations r
        join guests g on g.id = r.guest_id
        order by r.created_at desc
        limit 8
      `;

      return {
        roomStatus: {
          total,
          occupied,
          available: Math.max(total - occupied, 0),
        },
        arrivingToday,
        recentStatusEvents,
        recentBookings,
      };
    });
  });

  // GET /dashboard/occupancy?span=day|week|month — per-day occupancy series.
  app.get("/dashboard/occupancy", async (req) => {
    const q = req.query as { span?: string; today?: string };
    const span = q.span === "day" || q.span === "month" ? q.span : "week";
    const { from, to } = rangeFor(span, resolveToday(q));

    return withTenant(req.hotelId, async (tx) => {
      const [tot] = await tx`select count(*)::int as total from rooms`;
      const series = await tx`
        select
          d::date as date,
          (select count(distinct rr.room_id)::int
             from reservation_rooms rr
             where rr.status not in ('cancelled', 'no_show')
               and rr.check_in <= d and rr.check_out > d
          ) as occupied
        from generate_series(${from}::date, ${to}::date, interval '1 day') d
        order by d
      `;
      return { total: tot.total ?? 0, span, series };
    });
  });
}
