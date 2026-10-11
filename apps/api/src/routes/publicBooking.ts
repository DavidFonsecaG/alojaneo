import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sqlUnscoped, withTenant } from "../db.js";
import { computeDepositCents, getPaymentAdapter } from "../payments/index.js";
import { getMailer } from "../mail/index.js";

const availabilityQuerySchema = z.object({
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "checkIn must be YYYY-MM-DD"),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "checkOut must be YYYY-MM-DD"),
  guests: z.coerce.number().int().positive(),
});

const bookingBodySchema = z.object({
  guest: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
  }),
  rooms: z
    .array(
      z.object({
        roomTypeId: z.string().uuid(),
        ratePlanId: z.string().uuid(),
      }),
    )
    .min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "checkIn must be YYYY-MM-DD"),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "checkOut must be YYYY-MM-DD"),
});

export async function publicBookingRoutes(app: FastifyInstance) {
  // NO requireAuth here — these are public endpoints

  // GET /public/:hotelSlug — public hotel info + branding for the booking
  // engine (name, currency, banner, accent). Kept separate from availability so
  // the (potentially large) banner isn't refetched on every date change.
  app.get("/public/:hotelSlug", async (req, reply) => {
    const { hotelSlug } = req.params as { hotelSlug: string };

    const [hotel] = await sqlUnscoped`
      select name, slug, currency, banner_url, banner_position, accent_color,
             deposit_policy_type, deposit_percentage
      from hotels
      where slug = ${hotelSlug}
    `;

    if (!hotel) {
      return reply.code(404).send({ error: "Hotel not found" });
    }

    return {
      name: hotel.name,
      slug: hotel.slug,
      currency: hotel.currency,
      bannerUrl: hotel.banner_url,
      bannerPosition: hotel.banner_position,
      accentColor: hotel.accent_color,
      // What the guest pays up front, so checkout can show it before booking.
      deposit: {
        type: hotel.deposit_policy_type,
        percentage: hotel.deposit_percentage,
      },
    };
  });

  // GET /public/:hotelSlug/availability
  app.get("/public/:hotelSlug/availability", async (req, reply) => {
    const { hotelSlug } = req.params as { hotelSlug: string };
    const query = availabilityQuerySchema.parse(req.query);

    const [hotel] = await sqlUnscoped`
      select id, name, slug, currency
      from hotels
      where slug = ${hotelSlug}
    `;

    if (!hotel) {
      return reply.code(404).send({ error: "Hotel not found" });
    }

    const hotelId = hotel.id;
    const { checkIn, checkOut, guests } = query;

    // room_types, rooms and rate_plans are all RLS-protected. The hotel was
    // resolved from the slug above (hotels has no RLS), and from here every
    // query must run inside that hotel's tenant context — otherwise RLS
    // returns zero rows and availability comes back empty for every hotel.
    const results = await withTenant(hotelId, async (tx) => {
      // Find room types that can accommodate the guest count, along with
      // how many rooms of that type are available for the requested dates.
      const roomTypes = await tx`
        select
          rt.id,
          rt.name,
          rt.max_occupancy,
          rt.description,
          rt.amenities,
          (
            select coalesce(json_agg(p.data_url order by p.sort_order, p.created_at), '[]'::json)
            from room_type_photos p
            where p.room_type_id = rt.id
          ) as photos,
          (
            select count(*)::int
            from rooms r
            where r.hotel_id = ${hotelId}
              and r.room_type_id = rt.id
              and r.status = 'available'
              and r.id not in (
                select rr.room_id
                from reservation_rooms rr
                where rr.check_in < ${checkOut}
                  and rr.check_out > ${checkIn}
                  and rr.status not in ('cancelled', 'no_show')
              )
          ) as available_count
        from room_types rt
        where rt.hotel_id = ${hotelId}
          and rt.max_occupancy >= ${guests}
        order by rt.name
      `;

      // Filter to only room types that have at least one available room
      const availableRoomTypes = roomTypes.filter(
        (rt) => rt.available_count > 0,
      );

      // For each available room type, find bookable-online rate plans
      return Promise.all(
        availableRoomTypes.map(async (rt) => {
          const ratePlans = await tx`
            select
              rp.id,
              rp.name,
              rp.base_rate_cents,
              rp.cancellation_policy,
              rp.currency
            from rate_plans rp
            where rp.hotel_id = ${hotelId}
              and rp.room_type_id = ${rt.id}
              and rp.bookable_online = true
              and (rp.valid_from is null or rp.valid_from <= ${checkIn})
              and (rp.valid_to is null or rp.valid_to >= ${checkOut})
            order by rp.name
          `;

          return {
            roomType: {
              id: rt.id,
              name: rt.name,
              maxOccupancy: rt.max_occupancy,
              description: rt.description,
              amenities: rt.amenities,
              photos: rt.photos,
            },
            availableCount: rt.available_count,
            ratePlans: ratePlans.map((rp) => ({
              id: rp.id,
              name: rp.name,
              baseRateCents: rp.base_rate_cents,
              cancellationPolicy: rp.cancellation_policy,
              currency: rp.currency,
            })),
          };
        }),
      );
    });

    return results;
  });

  // POST /public/:hotelSlug/bookings
  app.post("/public/:hotelSlug/bookings", async (req, reply) => {
    const { hotelSlug } = req.params as { hotelSlug: string };
    const body = bookingBodySchema.parse(req.body);

    const [hotel] = await sqlUnscoped`
      select id, name, slug, currency, deposit_policy_type, deposit_percentage
      from hotels
      where slug = ${hotelSlug}
    `;

    if (!hotel) {
      return reply.code(404).send({ error: "Hotel not found" });
    }

    const hotelId = hotel.id;
    const { checkIn, checkOut } = body;

    // reservation_rooms.rate_cents holds the amount for the whole stay (this is
    // how the staff app stores it too), so multiply the plan's nightly base
    // rate by the number of nights.
    const stayNights = Math.max(
      1,
      Math.round(
        (Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000,
      ),
    );

    let result;
    try {
      // The hotel was resolved from the slug (hotels has no RLS); everything
      // below reads and writes RLS-protected tables (rooms, rate_plans,
      // guests, reservations, reservation_rooms), so it must run inside the
      // hotel's tenant context. withTenant runs it in a single transaction,
      // which is also what makes the availability-then-insert atomic.
      result = await withTenant(hotelId, async (tx) => {
      // For each requested room, find an available room of that type
      const assignedRooms: Array<{ roomId: string; ratePlanId: string; rateCents: number }> = [];

      for (const requested of body.rooms) {
        const [availableRoom] = await tx`
          select r.id
          from rooms r
          where r.hotel_id = ${hotelId}
            and r.room_type_id = ${requested.roomTypeId}
            and r.status = 'available'
            and r.id not in (
              select rr.room_id
              from reservation_rooms rr
              where rr.check_in < ${checkOut}
                and rr.check_out > ${checkIn}
                and rr.status not in ('cancelled', 'no_show')
            )
            and r.id not in (${assignedRooms.length > 0 ? tx(assignedRooms.map((a) => a.roomId)) : tx`select null::uuid where false`})
          limit 1
        `;

        if (!availableRoom) {
          throw Object.assign(
            new Error(`No available rooms for room type ${requested.roomTypeId}`),
            { statusCode: 409 },
          );
        }

        // Look up the rate plan to get the rate
        const [ratePlan] = await tx`
          select rp.base_rate_cents
          from rate_plans rp
          where rp.id = ${requested.ratePlanId}
            and rp.hotel_id = ${hotelId}
            and rp.room_type_id = ${requested.roomTypeId}
            and rp.bookable_online = true
        `;

        if (!ratePlan) {
          throw Object.assign(
            new Error(`Rate plan ${requested.ratePlanId} not found or not bookable online`),
            { statusCode: 400 },
          );
        }

        assignedRooms.push({
          roomId: availableRoom.id,
          ratePlanId: requested.ratePlanId,
          rateCents: ratePlan.base_rate_cents * stayNights,
        });
      }

      // Create or find the guest by email within this hotel
      let [guest] = await tx`
        select id, first_name, last_name, email, phone
        from guests
        where hotel_id = ${hotelId}
          and email = ${body.guest.email}
      `;

      if (!guest) {
        [guest] = await tx`
          insert into guests (hotel_id, first_name, last_name, email, phone)
          values (${hotelId}, ${body.guest.firstName}, ${body.guest.lastName}, ${body.guest.email}, ${body.guest.phone ?? null})
          returning id, first_name, last_name, email, phone
        `;
      }

      // Calculate total amount
      const totalAmountCents = assignedRooms.reduce(
        (sum, r) => sum + r.rateCents,
        0,
      );

      // Advance the hotel's booking counter and use it as the reference.
      const [{ booking_seq }] = await tx`
        update hotels set booking_seq = booking_seq + 1
        where id = ${hotelId}
        returning booking_seq
      `;
      const bookingRef = `BK-${booking_seq}`;

      // Create the reservation
      const [reservation] = await tx`
        insert into reservations (hotel_id, guest_id, total_amount_cents, currency, source, booking_ref)
        values (${hotelId}, ${guest.id}, ${totalAmountCents}, ${hotel.currency ?? 'USD'}, 'direct_booking', ${bookingRef})
        returning id, hotel_id, guest_id, total_amount_cents, currency, source, created_at, booking_ref
      `;

      // Create reservation_rooms for each assigned room
      const reservationRooms = await Promise.all(
        assignedRooms.map(
          (room) =>
            tx`
              insert into reservation_rooms (reservation_id, room_id, rate_plan_id, rate_cents, check_in, check_out, status)
              values (${reservation.id}, ${room.roomId}, ${room.ratePlanId}, ${room.rateCents}, ${checkIn}, ${checkOut}, 'confirmed')
              returning id, reservation_id, room_id, rate_plan_id, rate_cents, check_in, check_out, status
            `.then(([row]) => row),
        ),
      );

      return {
        reservationId: reservation.id,
        bookingRef: reservation.booking_ref,
        hotelName: hotel.name,
        guest: {
          firstName: guest.first_name,
          lastName: guest.last_name,
          email: guest.email,
        },
        checkIn,
        checkOut,
        totalAmountCents: reservation.total_amount_cents,
        currency: reservation.currency,
        rooms: reservationRooms.map((rr) => ({
          id: rr.id,
          roomId: rr.room_id,
          ratePlanId: rr.rate_plan_id,
          rateCents: rr.rate_cents,
          checkIn: rr.check_in,
          checkOut: rr.check_out,
          status: rr.status,
        })),
      };
      });
    } catch (err) {
      // The reservation_rooms exclusion constraint (migration 0004) fires
      // when a room was taken between our availability read and the insert —
      // the race the app-level check above cannot close on its own. Surface
      // it as a clean 409 rather than a 500.
      if ((err as { code?: string })?.code === "23P01") {
        return reply.code(409).send({
          error:
            "One or more rooms are no longer available for the selected dates",
        });
      }
      throw err;
    }

    // ── Deposit / payment ──────────────────────────────────────────────
    // The reservation exists; now collect the up-front deposit (if the hotel
    // requires one) through the configured gateway. The charge is an external
    // call, so it runs after the create transaction has committed.
    const totalCents = result.totalAmountCents as number;
    const depositCents = computeDepositCents(
      hotel.deposit_policy_type,
      hotel.deposit_percentage,
      totalCents,
    );

    let payment: {
      status: "none" | "completed" | "failed";
      amountCents: number;
      balanceDueCents: number;
      method: string | null;
      transactionId: string | null;
    } = {
      status: "none",
      amountCents: 0,
      balanceDueCents: totalCents,
      method: null,
      transactionId: null,
    };

    if (depositCents > 0) {
      const adapter = getPaymentAdapter();
      const charge = await adapter.charge({
        amountCents: depositCents,
        currency: result.currency ?? hotel.currency ?? "USD",
        reference: result.bookingRef,
        description: `Booking ${result.bookingRef} — ${hotel.name}`,
        customerEmail: result.guest.email ?? undefined,
      });

      // Record the attempt (completed or failed) for the audit trail.
      await withTenant(hotelId, (tx) =>
        tx`
          insert into payments (hotel_id, reservation_id, amount_cents, currency, method, status, reference)
          values (${hotelId}, ${result.reservationId}, ${depositCents}, ${result.currency ?? "USD"}, ${adapter.name}, ${charge.status}, ${charge.transactionId})
        `,
      );

      if (charge.status === "failed") {
        // A declined deposit shouldn't hold inventory — release the rooms.
        await withTenant(hotelId, (tx) =>
          tx`update reservation_rooms set status = 'cancelled' where reservation_id = ${result.reservationId}`,
        );
        return reply.code(402).send({
          error: charge.error ?? "Payment was declined.",
          bookingRef: result.bookingRef,
        });
      }

      payment = {
        status: "completed",
        amountCents: depositCents,
        balanceDueCents: totalCents - depositCents,
        method: adapter.name,
        transactionId: charge.transactionId,
      };
    }

    // Email the guest a confirmation — best-effort, never fail the booking on
    // a mail hiccup.
    if (result.guest.email) {
      void getMailer()
        .sendBookingConfirmation(result.guest.email, {
          bookingRef: result.bookingRef,
          hotelName: result.hotelName,
          guestName: `${result.guest.firstName} ${result.guest.lastName}`,
          checkIn,
          checkOut,
          nights: stayNights,
          totalCents,
          paidCents: payment.amountCents,
          balanceCents: payment.balanceDueCents,
          currency: result.currency ?? hotel.currency ?? "USD",
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error(
            "[mail] booking confirmation failed:",
            (err as Error).message,
          );
        });
    }

    return reply.code(201).send({ ...result, payment });
  });
}
