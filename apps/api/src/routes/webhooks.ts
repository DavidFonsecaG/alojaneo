import type { FastifyInstance } from "fastify";
import { sqlUnscoped } from "../db.js";
import { getHotelPaymentConfig, getPaymentAdapter } from "../payments/index.js";
import { settlePayment } from "../payments/settle.js";
import { nightsBetween, sendBookingConfirmation } from "../mail/notify.js";

// Inbound payment-gateway webhooks. No auth and no tenant context: the hotel is
// resolved from an unguessable token in the URL (a column on the non-RLS hotels
// table), the signature is verified with that hotel's secret, and settlement
// then runs inside withTenant() via settlePayment(). Idempotent — duplicate
// deliveries are dropped by the unique (provider, event_id) on the event log.
export async function webhookRoutes(app: FastifyInstance) {
  // We need the raw bytes to verify the HMAC signature, so parse the body as a
  // Buffer. Encapsulated to this plugin — other routes keep JSON parsing.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => done(null, body),
  );

  app.post<{ Params: { webhookToken: string } }>(
    "/webhooks/payments/:webhookToken",
    async (req, reply) => {
      const { webhookToken } = req.params;
      const raw = Buffer.isBuffer(req.body)
        ? (req.body as Buffer)
        : Buffer.from(String(req.body ?? ""));

      const [hotel] = await sqlUnscoped`
        select id from hotels where payment_webhook_token = ${webhookToken}
      `;
      // Unknown token: 404 (don't ask the gateway to retry a bad endpoint).
      if (!hotel) return reply.code(404).send({ error: "Unknown webhook" });

      const adapter = await getPaymentAdapter(hotel.id);
      const cfg = await getHotelPaymentConfig(hotel.id);

      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string") headers[k.toLowerCase()] = v;
      }

      const event = adapter.parseWebhook(raw, headers, cfg?.privateKey ?? "");
      // Bad signature or a payload we don't handle → 400 (not retried forever).
      if (!event) return reply.code(400).send({ error: "Invalid webhook" });

      // Idempotency + audit: record the event; a duplicate (same provider +
      // event id) returns no row and we ack without re-processing.
      const [logged] = await sqlUnscoped`
        insert into payment_webhook_events (provider, event_id, payload)
        values (${adapter.name}, ${event.eventId}, ${sqlUnscoped.json(
          JSON.parse(raw.toString("utf8") || "{}"),
        )})
        on conflict (provider, event_id) do nothing
        returning id
      `;
      if (!logged) return reply.send({ ok: true, duplicate: true });

      // Only completed/failed events settle; a 'pending' notification is noted
      // and left for the next event or reconciliation.
      if (event.status === "completed" || event.status === "failed") {
        const outcome = await settlePayment(hotel.id, event.clientTxId, {
          status: event.status,
          transactionId: event.providerTxId,
        });
        // Guest paid but may never have returned — if this webhook is what
        // completed the booking, send the confirmation email now.
        if (
          outcome.transitioned &&
          outcome.status === "completed" &&
          outcome.guest?.email
        ) {
          const [h] = await sqlUnscoped`
            select name from hotels where id = ${hotel.id}
          `;
          const total = outcome.totalCents ?? 0;
          const paid = outcome.amountCents ?? 0;
          sendBookingConfirmation(outcome.guest.email, {
            bookingRef: outcome.bookingRef!,
            hotelName: h?.name ?? "",
            guestName: `${outcome.guest.firstName} ${outcome.guest.lastName}`,
            checkIn: outcome.checkIn!,
            checkOut: outcome.checkOut!,
            nights: nightsBetween(outcome.checkIn!, outcome.checkOut!),
            totalCents: total,
            paidCents: paid,
            balanceCents: total - paid,
            currency: outcome.currency ?? "USD",
          });
        }
      }

      await sqlUnscoped`
        update payment_webhook_events set processed_at = now() where id = ${logged.id}
      `;
      return reply.send({ ok: true });
    },
  );
}
