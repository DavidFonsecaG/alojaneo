import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenant } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { getPaymentAdapter } from "../payments/index.js";

const createPaymentSchema = z.object({
  reservationId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  currency: z.string().min(1).default("USD"),
  method: z.enum(["cash", "credit_card", "bank_transfer"]),
  reference: z.string().optional(),
});

export async function paymentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.post("/payments", async (req, reply) => {
    const body = createPaymentSchema.parse(req.body);

    const [payment] = await withTenant(req.hotelId, (tx) =>
      tx`
        insert into payments (hotel_id, reservation_id, amount_cents, currency, method, reference)
        values (${req.hotelId}, ${body.reservationId}, ${body.amountCents}, ${body.currency}, ${body.method}, ${body.reference ?? null})
        returning id, reservation_id, amount_cents, currency, method, status, reference, created_at
      `,
    );

    return reply.code(201).send(payment);
  });

  app.get("/payments", async (req) => {
    const { reservationId } = req.query as { reservationId?: string };

    // Joined to reservation + guest so the finance ledger shows the booking ref
    // and guest name; per-reservation callers just ignore the extra columns.
    return withTenant(req.hotelId, (tx) =>
      tx`
        select
          p.id, p.reservation_id, p.amount_cents, p.currency, p.method,
          p.status, p.reference, p.created_at,
          r.booking_ref,
          g.first_name as guest_first_name,
          g.last_name as guest_last_name
        from payments p
        join reservations r on r.id = p.reservation_id
        join guests g on g.id = r.guest_id
        where ${reservationId ? tx`p.reservation_id = ${reservationId}` : tx`true`}
        order by p.created_at desc
      `,
    );
  });

  app.get("/payments/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    const [payment] = await withTenant(req.hotelId, (tx) =>
      tx`select id, reservation_id, amount_cents, currency, method, status, reference, created_at
         from payments where id = ${id}`,
    );

    if (!payment) return reply.code(404).send({ error: "Payment not found" });
    return payment;
  });

  app.patch("/payments/:id/status", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { status } = z
      .object({ status: z.enum(["pending", "completed", "refunded", "failed"]) })
      .parse(req.body);

    const [updated] = await withTenant(req.hotelId, (tx) =>
      tx`update payments set status = ${status} where id = ${id}
         returning id, reservation_id, amount_cents, currency, method, status, reference, created_at`,
    );

    if (!updated) return reply.code(404).send({ error: "Payment not found" });
    return updated;
  });

  // POST /payments/:id/refund — refund a completed payment in full. Gated to
  // rooms/payment managers (admins bypass). Gateway-originated payments go back
  // through the adapter; manually-recorded ones (cash, etc.) are just marked
  // refunded (the cash is handed back at the desk).
  app.post<{ Params: { id: string } }>(
    "/payments/:id/refund",
    { preHandler: requirePermission("payments", "manage") },
    async (req, reply) => {
      const { id } = req.params;

      const [payment] = await withTenant(req.hotelId, (tx) =>
        tx`select id, amount_cents, method, provider, status, reference, provider_tx_id
           from payments where id = ${id}`,
      );

      if (!payment) {
        return reply.code(404).send({ error: "Payment not found" });
      }
      if (payment.status !== "completed") {
        return reply.code(409).send({
          error: `Only completed payments can be refunded (this one is ${payment.status}).`,
        });
      }

      // Only round-trip to the gateway for payments it processed.
      const adapter = await getPaymentAdapter(req.hotelId);
      if ((payment.provider ?? payment.method) === adapter.name) {
        const refund = await adapter.refund(
          payment.provider_tx_id ?? payment.reference ?? "",
          payment.amount_cents,
        );
        if (refund.status === "failed") {
          return reply.code(502).send({
            error: refund.error ?? "Refund failed at the gateway.",
          });
        }
      }

      const [updated] = await withTenant(req.hotelId, (tx) =>
        tx`update payments set status = 'refunded' where id = ${id}
           returning id, reservation_id, amount_cents, currency, method, status, reference, created_at`,
      );

      return updated;
    },
  );
}
