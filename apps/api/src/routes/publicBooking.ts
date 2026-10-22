import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sqlUnscoped, withTenant } from "../db.js";
import { computeDepositCents, getPaymentAdapter } from "../payments/index.js";
import { settlePayment } from "../payments/settle.js";
import {
  nightsBetween,
  sendBookingConfirmation as sendConfirmationEmail,
} from "../mail/notify.js";

// Where the booking engine lives — the gateway returns the guest here after
// paying, carrying our pay_return=<reservationId> plus the gateway's ids.
const bookingBaseUrl = () =>
  process.env.BOOKING_PUBLIC_URL ?? "http://localhost:5174";

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
  // Card token minted client-side by the gateway SDK (Kushki). Optional: the
  // mock/redirect gateways don't use it.
  paymentToken: z.string().optional(),
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
             deposit_policy_type, deposit_percentage,
             payment_provider, payment_public_key, payment_enabled
      from hotels
      where slug = ${hotelSlug}
    `;

    if (!hotel) {
      return reply.code(404).send({ error: "Hotel not found" });
    }

    // Only token gateways need a client-side SDK + card fields; the public key
    // is safe to publish. The private key / webhook token never leave the API.
    const tokenProviders = ["kushki"];
    const paymentEnabled = !!hotel.payment_enabled;

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
      payment: {
        provider: hotel.payment_provider ?? "mock",
        publicKey: hotel.payment_public_key ?? null,
        enabled: paymentEnabled,
        // True when the booking engine must collect a card + tokenise it.
        tokenRequired:
          paymentEnabled && tokenProviders.includes(hotel.payment_provider),
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
    // requires one) through the configured gateway. For a real gateway this
    // starts a redirect flow (status "pending") finished by confirm-payment;
    // the mock settles instantly ("completed").
    const totalCents = result.totalAmountCents as number;
    const currency = result.currency ?? hotel.currency ?? "USD";
    const depositCents = computeDepositCents(
      hotel.deposit_policy_type,
      hotel.deposit_percentage,
      totalCents,
    );

    let payment: {
      status: "none" | "pending" | "completed" | "failed";
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
    let redirectUrl: string | null = null;

    if (depositCents > 0) {
      const adapter = await getPaymentAdapter(hotelId);
      const returnUrl = `${bookingBaseUrl()}/${hotelSlug}?pay_return=${result.reservationId}`;
      const intent = await adapter.createIntent({
        reservationId: result.reservationId,
        amountCents: depositCents,
        currency,
        reference: result.bookingRef,
        description: `Booking ${result.bookingRef} — ${hotel.name}`,
        customerEmail: result.guest.email ?? undefined,
        returnUrl,
        paymentToken: body.paymentToken,
      });

      // Record the attempt with the new lifecycle columns: `method` is how
      // (card), `provider` is who processed it, `client_tx_id` is our stable
      // handle; `provider_tx_id` is filled now only when it settled instantly
      // (the mock), otherwise by settlePayment() after confirm.
      await withTenant(hotelId, (tx) =>
        tx`
          insert into payments
            (hotel_id, reservation_id, amount_cents, currency, method, provider, status, client_tx_id, provider_tx_id)
          values
            (${hotelId}, ${result.reservationId}, ${depositCents}, ${currency}, 'card', ${adapter.name}, ${intent.status}, ${intent.clientTxId},
             ${intent.providerTxId ?? (intent.status === "completed" ? intent.clientTxId : null)})
        `,
      );

      if (intent.status === "failed") {
        // A declined deposit shouldn't hold inventory — release the rooms.
        await withTenant(hotelId, (tx) =>
          tx`update reservation_rooms set status = 'cancelled' where reservation_id = ${result.reservationId}`,
        );
        return reply.code(402).send({
          error: intent.error ?? "Payment was declined.",
          bookingRef: result.bookingRef,
        });
      }

      payment = {
        status: intent.status, // "pending" or "completed"
        amountCents: depositCents,
        balanceDueCents: totalCents - depositCents,
        method: adapter.name,
        transactionId: intent.clientTxId,
      };

      if (intent.status === "pending") {
        // Guest must pay at the gateway; the confirmation email waits until
        // confirm-payment reports success.
        redirectUrl = intent.redirectUrl;
        return reply.code(201).send({ ...result, payment, redirectUrl });
      }
    }

    if (result.guest.email) {
      sendConfirmationEmail(result.guest.email, {
        bookingRef: result.bookingRef,
        hotelName: result.hotelName,
        guestName: `${result.guest.firstName} ${result.guest.lastName}`,
        checkIn,
        checkOut,
        nights: stayNights,
        totalCents,
        paidCents: payment.amountCents,
        balanceCents: payment.balanceDueCents,
        currency,
      });
    }

    return reply.code(201).send({ ...result, payment, redirectUrl });
  });

  // POST /public/:hotelSlug/reservations/:reservationId/confirm-payment
  // Called when the guest returns from the gateway's hosted checkout. Confirms
  // the pending deposit, finalises (or cancels) the booking, and emails the
  // guest on success. Idempotent for an already-confirmed payment.
  app.post<{ Params: { hotelSlug: string; reservationId: string } }>(
    "/public/:hotelSlug/reservations/:reservationId/confirm-payment",
    async (req, reply) => {
      const { hotelSlug, reservationId } = req.params;
      const body = z
        .object({ clientTxId: z.string().min(1), providerTxId: z.string().optional() })
        .parse(req.body);

      const [hotel] = await sqlUnscoped`
        select id, name, currency from hotels where slug = ${hotelSlug}
      `;
      if (!hotel) return reply.code(404).send({ error: "Hotel not found" });

      // Pre-check: short-circuit an already-completed payment without a
      // redundant gateway round-trip, and fetch the amount for confirm().
      const [pre] = await withTenant(hotel.id, (tx) =>
        tx`
          select p.status, p.amount_cents, p.currency, r.booking_ref
          from payments p
          join reservations r on r.id = p.reservation_id
          where p.reservation_id = ${reservationId}
            and p.client_tx_id = ${body.clientTxId}
            and p.kind = 'charge'
        `,
      );
      if (!pre) return reply.code(404).send({ error: "Payment not found" });
      if (pre.status === "completed") {
        return reply.send({ status: "completed", bookingRef: pre.booking_ref });
      }
      if (pre.status !== "pending") {
        return reply.code(409).send({ error: `Payment is ${pre.status}` });
      }

      const adapter = await getPaymentAdapter(hotel.id);
      const confirmed = await adapter.confirm({
        clientTxId: body.clientTxId,
        providerTxId: body.providerTxId,
        amountCents: pre.amount_cents,
        currency: pre.currency,
      });

      // The single settlement path: writes status + provider_tx_id, releases
      // rooms on failure, idempotent across confirm/webhook/reconcile.
      const outcome = await settlePayment(hotel.id, body.clientTxId, confirmed);

      if (outcome.status !== "completed") {
        return reply.code(402).send({
          error: confirmed.error ?? "Payment was not completed.",
          bookingRef: outcome.bookingRef ?? pre.booking_ref,
        });
      }

      const total = outcome.totalCents ?? 0;
      const paid = outcome.amountCents ?? pre.amount_cents;
      // Email only when this call is the one that completed it (not on replay).
      if (outcome.transitioned && outcome.guest?.email) {
        sendConfirmationEmail(outcome.guest.email, {
          bookingRef: outcome.bookingRef!,
          hotelName: hotel.name,
          guestName: `${outcome.guest.firstName} ${outcome.guest.lastName}`,
          checkIn: outcome.checkIn!,
          checkOut: outcome.checkOut!,
          nights: nightsBetween(outcome.checkIn!, outcome.checkOut!),
          totalCents: total,
          paidCents: paid,
          balanceCents: total - paid,
          currency: pre.currency,
        });
      }

      return reply.send({
        status: "completed",
        bookingRef: outcome.bookingRef,
        paidCents: paid,
        balanceCents: total - paid,
      });
    },
  );
}
