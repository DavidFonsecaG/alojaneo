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

    // Recorded at the desk (cash/card/transfer) → provider 'manual'.
    const [payment] = await withTenant(req.hotelId, (tx) =>
      tx`
        insert into payments (hotel_id, reservation_id, amount_cents, currency, method, provider, reference)
        values (${req.hotelId}, ${body.reservationId}, ${body.amountCents}, ${body.currency}, ${body.method}, 'manual', ${body.reference ?? null})
        returning id, reservation_id, amount_cents, currency, method, provider, kind, status, reference, created_at
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
          p.provider, p.kind, p.parent_payment_id, p.status, p.reference, p.created_at,
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
      tx`select id, reservation_id, amount_cents, currency, method, provider, kind, status, reference, created_at
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

  // POST /payments/:id/refund — refund a completed charge, fully or partially.
  // A refund is its own row (kind='refund', negative amount, parent_payment_id)
  // so the ledger nets correctly, partial refunds add up, and nothing is lost;
  // the original charge stays 'completed'. Gateway-processed charges go back
  // through the adapter; manual ones (cash, etc.) just record the row.
  app.post<{ Params: { id: string } }>(
    "/payments/:id/refund",
    { preHandler: requirePermission("payments", "manage") },
    async (req, reply) => {
      const { id } = req.params;
      const { amountCents } = z
        .object({ amountCents: z.number().int().positive().optional() })
        .parse(req.body ?? {});

      const [charge] = await withTenant(req.hotelId, (tx) =>
        tx`
          select id, reservation_id, amount_cents, currency, method, provider,
                 kind, status, reference, provider_tx_id,
                 coalesce((
                   select sum(-amount_cents) from payments
                   where parent_payment_id = p.id
                     and kind = 'refund' and status = 'completed'
                 ), 0)::int as already_refunded
          from payments p
          where id = ${id}
        `,
      );

      if (!charge) return reply.code(404).send({ error: "Payment not found" });
      if (charge.kind === "refund") {
        return reply.code(409).send({ error: "A refund can't be refunded." });
      }
      if (charge.status !== "completed") {
        return reply.code(409).send({
          error: `Only completed payments can be refunded (this one is ${charge.status}).`,
        });
      }

      const remaining = charge.amount_cents - charge.already_refunded;
      if (remaining <= 0) {
        return reply.code(409).send({ error: "This payment is fully refunded." });
      }
      const refundAmount = amountCents ?? remaining;
      if (refundAmount > remaining) {
        return reply.code(409).send({
          error: `Refund exceeds the refundable amount (${remaining} cents left).`,
        });
      }

      // Round-trip to the gateway only for charges it processed.
      const adapter = await getPaymentAdapter(req.hotelId);
      let refundTxId = charge.provider_tx_id ?? charge.reference ?? null;
      if ((charge.provider ?? charge.method) === adapter.name) {
        const refund = await adapter.refund(
          charge.provider_tx_id ?? charge.reference ?? "",
          refundAmount,
        );
        if (refund.status === "failed") {
          return reply.code(502).send({
            error: refund.error ?? "Refund failed at the gateway.",
          });
        }
        refundTxId = refund.transactionId;
      }

      const [row] = await withTenant(req.hotelId, (tx) =>
        tx`
          insert into payments
            (hotel_id, reservation_id, amount_cents, currency, method, provider,
             status, kind, parent_payment_id, provider_tx_id)
          values
            (${req.hotelId}, ${charge.reservation_id}, ${-refundAmount},
             ${charge.currency}, ${charge.method}, ${charge.provider},
             'completed', 'refund', ${charge.id}, ${refundTxId})
          returning id, reservation_id, amount_cents, currency, method, provider,
                    kind, parent_payment_id, status, reference, created_at
        `,
      );

      return reply.code(201).send(row);
    },
  );
}
