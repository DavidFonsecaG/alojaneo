import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenant } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";

const createReservationSchema = z.object({
  guestId: z.string().uuid(),
  rooms: z
    .array(
      z
        .object({
          roomId: z.string().uuid(),
          ratePlanId: z.string().uuid().optional(),
          rateCents: z.number().int().nonnegative(),
          checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
        .refine((r) => r.checkOut > r.checkIn, {
          message: "checkOut must be after checkIn",
        }),
    )
    .min(1),
  source: z.string().optional(),
});

const updateRoomStatusSchema = z.object({
  status: z.enum([
    "confirmed",
    "checked_in",
    "checked_out",
    "cancelled",
    "no_show",
  ]),
});

const createNoteSchema = z.object({
  body: z.string().min(1),
});

export async function reservationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // POST /reservations — create a reservation with room assignments
  app.post("/reservations", async (req, reply) => {
    const body = createReservationSchema.parse(req.body);
    const totalAmountCents = body.rooms.reduce(
      (sum, r) => sum + r.rateCents,
      0,
    );
    const source = body.source ?? "manual";

    try {
      const result = await withTenant(req.hotelId, async (tx) => {
        // Reject rooms that already have an active booking overlapping the
        // requested dates, so staff get a clear message instead of a raw
        // constraint error. This is the friendly path; the exclusion
        // constraint added in migration 0004 is the real guard that also
        // covers the read-then-write race under the connection pool.
        for (const r of body.rooms) {
          const [conflict] = await tx`
            select 1
            from reservation_rooms
            where room_id = ${r.roomId}
              and status not in ('cancelled', 'no_show')
              and check_in < ${r.checkOut}
              and check_out > ${r.checkIn}
            limit 1
          `;
          if (conflict) {
            throw Object.assign(
              new Error(
                `Room is not available for ${r.checkIn} to ${r.checkOut}`,
              ),
              { statusCode: 409 },
            );
          }
        }

        // Advance the hotel's booking counter atomically (row lock) and use
        // it as this reservation's human-friendly reference.
        const [{ booking_seq }] = await tx`
          update hotels set booking_seq = booking_seq + 1
          where id = ${req.hotelId}
          returning booking_seq
        `;
        const bookingRef = `BK-${booking_seq}`;

        const [reservation] = await tx`
          insert into reservations (hotel_id, guest_id, total_amount_cents, source, created_by, booking_ref)
          values (${req.hotelId}, ${body.guestId}, ${totalAmountCents}, ${source}, ${req.userId}, ${bookingRef})
          returning id, hotel_id, guest_id, total_amount_cents, source, created_by, created_at, booking_ref
        `;

        const rooms = await Promise.all(
          body.rooms.map(
            (r) =>
              tx`
              insert into reservation_rooms (reservation_id, room_id, rate_plan_id, rate_cents, check_in, check_out, status)
              values (${reservation.id}, ${r.roomId}, ${r.ratePlanId ?? null}, ${r.rateCents}, ${r.checkIn}, ${r.checkOut}, 'confirmed')
              returning id, reservation_id, room_id, rate_plan_id, rate_cents, check_in, check_out, status, created_at
            `.then(([row]) => row),
          ),
        );

        return { ...reservation, rooms };
      });

      return reply.code(201).send(result);
    } catch (err) {
      // Friendly pre-check conflict (tagged above), or the exclusion
      // constraint firing on a concurrent/intra-request overlap (23P01).
      if ((err as { statusCode?: number })?.statusCode === 409) {
        return reply.code(409).send({ error: (err as Error).message });
      }
      if ((err as { code?: string })?.code === "23P01") {
        return reply.code(409).send({
          error:
            "One or more rooms are no longer available for the selected dates",
        });
      }
      throw err;
    }
  });

  // GET /reservations — list reservations with optional filters
  app.get("/reservations", async (req) => {
    const { status, from, to } = req.query as {
      status?: string;
      from?: string;
      to?: string;
    };

    return withTenant(req.hotelId, (tx) => {
      const conditions = [tx`1 = 1`];

      if (status) {
        conditions.push(
          tx`r.id in (select rr.reservation_id from reservation_rooms rr where rr.status = ${status})`,
        );
      }
      if (from) {
        conditions.push(
          tx`r.id in (select rr.reservation_id from reservation_rooms rr where rr.check_in >= ${from})`,
        );
      }
      if (to) {
        conditions.push(
          tx`r.id in (select rr.reservation_id from reservation_rooms rr where rr.check_out <= ${to})`,
        );
      }

      const where = conditions.reduce(
        (acc, cond) => tx`${acc} and ${cond}`,
      );

      return tx`
        select
          r.id,
          r.booking_ref,
          r.guest_id,
          r.total_amount_cents,
          r.source,
          r.created_by,
          r.created_at,
          g.first_name as guest_first_name,
          g.last_name as guest_last_name,
          (select min(rr.check_in) from reservation_rooms rr where rr.reservation_id = r.id) as check_in,
          (select max(rr.check_out) from reservation_rooms rr where rr.reservation_id = r.id) as check_out,
          case
            when exists (select 1 from reservation_rooms rr where rr.reservation_id = r.id and rr.status = 'checked_in') then 'active'
            when (select count(*) from reservation_rooms rr where rr.reservation_id = r.id) =
                 (select count(*) from reservation_rooms rr where rr.reservation_id = r.id and rr.status = 'cancelled') then 'cancelled'
            when (select count(*) from reservation_rooms rr where rr.reservation_id = r.id) =
                 (select count(*) from reservation_rooms rr where rr.reservation_id = r.id and rr.status = 'checked_out') then 'checked_out'
            else 'confirmed'
          end as status
        from reservations r
        join guests g on g.id = r.guest_id
        where ${where}
        order by (select min(rr.check_in) from reservation_rooms rr where rr.reservation_id = r.id) desc
      `;
    });
  });

  // GET /reservations/timeline — per-room stays overlapping a date window.
  // Powers the room-timeline (tape chart) view. Deliberately windowed: it
  // returns only the reservation_rooms that intersect [from, to), joined with
  // the room number and guest name, so the client fetches just what the
  // visible range needs rather than every reservation plus N detail calls.
  // Static route, so Fastify matches it ahead of "/reservations/:id".
  app.get("/reservations/timeline", async (req) => {
    const q = req.query as { from?: string; to?: string };
    const isDate = (s: string | undefined): s is string =>
      !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

    // Default to a two-week window starting today when unspecified.
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const from = isDate(q.from) ? q.from : iso(today);
    const to = isDate(q.to)
      ? q.to
      : iso(new Date(today.getTime() + 14 * 86_400_000));

    return withTenant(req.hotelId, (tx) => tx`
      select
        rr.id,
        rr.reservation_id,
        rr.room_id,
        rr.rate_cents,
        rr.check_in,
        rr.check_out,
        rr.status,
        rm.room_number,
        g.first_name as guest_first_name,
        g.last_name as guest_last_name
      from reservation_rooms rr
      join rooms rm on rm.id = rr.room_id
      join reservations r on r.id = rr.reservation_id
      join guests g on g.id = r.guest_id
      where rr.status not in ('cancelled', 'no_show')
        and rr.check_in < ${to}
        and rr.check_out > ${from}
      order by rm.room_number, rr.check_in
    `);
  });

  // GET /reservations/:id — get reservation detail with embedded rooms and notes
  app.get("/reservations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    const result = await withTenant(req.hotelId, async (tx) => {
      const [reservation] = await tx`
        select
          r.id,
          r.booking_ref,
          r.guest_id,
          r.total_amount_cents,
          r.source,
          r.external_reservation_id,
          r.channel,
          r.created_by,
          r.created_at,
          g.first_name as guest_first_name,
          g.last_name as guest_last_name
        from reservations r
        join guests g on g.id = r.guest_id
        where r.id = ${id}
      `;

      if (!reservation) return null;

      const rooms = await tx`
        select
          rr.id,
          rr.room_id,
          rr.rate_plan_id,
          rr.rate_cents,
          rr.check_in,
          rr.check_out,
          rr.status,
          rr.created_at,
          rm.room_number
        from reservation_rooms rr
        join rooms rm on rm.id = rr.room_id
        where rr.reservation_id = ${id}
      `;

      const notes = await tx`
        select
          rn.id,
          rn.reservation_id,
          rn.user_id,
          rn.body,
          rn.created_at,
          u.email as user_email
        from reservation_notes rn
        join users u on u.id = rn.user_id
        where rn.reservation_id = ${id}
        order by rn.created_at asc
      `;

      return { ...reservation, rooms, notes };
    });

    if (!result) {
      return reply.code(404).send({ error: "Reservation not found" });
    }

    return result;
  });

  // PATCH /reservation-rooms/:id/status — update a single room-stay's status
  app.patch("/reservation-rooms/:id/status", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateRoomStatusSchema.parse(req.body);

    const result = await withTenant(req.hotelId, async (tx) => {
      const [current] = await tx`
        select rr.id, rr.status, rr.room_id
        from reservation_rooms rr
        join reservations r on r.id = rr.reservation_id
        where rr.id = ${id}
      `;

      if (!current) return null;

      const oldStatus = current.status;

      const [updated] = await tx`
        update reservation_rooms
        set status = ${body.status}
        where id = ${id}
        returning id, reservation_id, room_id, rate_plan_id, rate_cents, check_in, check_out, status, created_at
      `;

      await tx`
        insert into reservation_status_history (reservation_room_id, old_status, new_status, changed_by)
        values (${id}, ${oldStatus}, ${body.status}, ${req.userId})
      `;

      if (body.status === "checked_out") {
        await tx`
          update rooms
          set housekeeping_status = 'dirty'
          where id = ${current.room_id}
        `;
      }

      return updated;
    });

    if (!result) {
      return reply.code(404).send({ error: "Reservation room not found" });
    }

    return result;
  });

  // POST /reservations/:id/notes — add a note to a reservation
  app.post("/reservations/:id/notes", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = createNoteSchema.parse(req.body);

    const result = await withTenant(req.hotelId, async (tx) => {
      const [reservation] = await tx`
        select id from reservations where id = ${id}
      `;

      if (!reservation) return null;

      const [note] = await tx`
        insert into reservation_notes (reservation_id, user_id, body)
        values (${id}, ${req.userId}, ${body.body})
        returning id, reservation_id, user_id, body, created_at
      `;

      return note;
    });

    if (!result) {
      return reply.code(404).send({ error: "Reservation not found" });
    }

    return reply.code(201).send(result);
  });
}
