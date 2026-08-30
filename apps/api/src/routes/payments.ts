import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenant } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";

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

    return withTenant(req.hotelId, (tx) =>
      reservationId
        ? tx`select id, reservation_id, amount_cents, currency, method, status, reference, created_at
             from payments where reservation_id = ${reservationId} order by created_at desc`
        : tx`select id, reservation_id, amount_cents, currency, method, status, reference, created_at
             from payments order by created_at desc`,
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
}
