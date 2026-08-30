import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenant } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";

const RATE_PLAN_COLUMNS = `id, room_type_id, name, base_rate_cents, currency,
  cancellation_policy, min_stay, max_stay, bookable_online,
  valid_from, valid_to, created_at`;

const createRatePlanSchema = z.object({
  roomTypeId: z.string().min(1),
  name: z.string().min(1),
  baseRateCents: z.number().int().positive(),
  currency: z.string().optional(),
  cancellationPolicy: z.string().optional(),
  minStay: z.number().int().positive().optional(),
  maxStay: z.number().int().positive().optional(),
  bookableOnline: z.boolean().optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
});

const rateOverrideSchema = z.object({
  overrideDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rateCents: z.number().int().positive(),
});

export async function ratePlanRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.post("/rate-plans", async (req, reply) => {
    const body = createRatePlanSchema.parse(req.body);

    const [ratePlan] = await withTenant(req.hotelId, (tx) =>
      tx`
        insert into rate_plans (hotel_id, room_type_id, name, base_rate_cents, currency,
          cancellation_policy, min_stay, max_stay, bookable_online, valid_from, valid_to)
        values (${req.hotelId}, ${body.roomTypeId}, ${body.name}, ${body.baseRateCents},
          ${body.currency ?? "USD"}, ${body.cancellationPolicy ?? null},
          ${body.minStay ?? null}, ${body.maxStay ?? null}, ${body.bookableOnline ?? true},
          ${body.validFrom ?? null}, ${body.validTo ?? null})
        returning ${tx.unsafe(RATE_PLAN_COLUMNS)}
      `,
    );

    return reply.code(201).send(ratePlan);
  });

  app.get("/rate-plans", async (req) => {
    const { roomTypeId } = req.query as { roomTypeId?: string };
    return withTenant(req.hotelId, (tx) =>
      roomTypeId
        ? tx`select ${tx.unsafe(RATE_PLAN_COLUMNS)} from rate_plans where room_type_id = ${roomTypeId} order by name`
        : tx`select ${tx.unsafe(RATE_PLAN_COLUMNS)} from rate_plans order by name`,
    );
  });

  app.get("/rate-plans/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    const [ratePlan] = await withTenant(req.hotelId, (tx) =>
      tx`select ${tx.unsafe(RATE_PLAN_COLUMNS)} from rate_plans where id = ${id}`,
    );

    if (!ratePlan) {
      return reply.code(404).send({ error: "Rate plan not found" });
    }

    return ratePlan;
  });

  app.put("/rate-plans/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = createRatePlanSchema.parse(req.body);

    const [ratePlan] = await withTenant(req.hotelId, (tx) =>
      tx`
        update rate_plans
        set room_type_id = ${body.roomTypeId},
            name = ${body.name},
            base_rate_cents = ${body.baseRateCents},
            currency = ${body.currency ?? "USD"},
            cancellation_policy = ${body.cancellationPolicy ?? null},
            min_stay = ${body.minStay ?? null},
            max_stay = ${body.maxStay ?? null},
            bookable_online = ${body.bookableOnline ?? true},
            valid_from = ${body.validFrom ?? null},
            valid_to = ${body.validTo ?? null}
        where id = ${id}
        returning ${tx.unsafe(RATE_PLAN_COLUMNS)}
      `,
    );

    if (!ratePlan) {
      return reply.code(404).send({ error: "Rate plan not found" });
    }

    return ratePlan;
  });

  app.delete("/rate-plans/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    const result = await withTenant(req.hotelId, (tx) =>
      tx`delete from rate_plans where id = ${id}`,
    );

    if (result.count === 0) {
      return reply.code(404).send({ error: "Rate plan not found" });
    }

    return reply.code(204).send();
  });

  // ── Rate overrides (seasonal pricing) ─────────────────────────────

  app.post("/rate-plans/:id/overrides", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = rateOverrideSchema.parse(req.body);

    const [override] = await withTenant(req.hotelId, (tx) =>
      tx`
        insert into rate_overrides (rate_plan_id, override_date, rate_cents)
        values (${id}, ${body.overrideDate}, ${body.rateCents})
        returning id, rate_plan_id, override_date, rate_cents, created_at
      `,
    );

    return reply.code(201).send(override);
  });

  app.get("/rate-plans/:id/overrides", async (req) => {
    const { id } = req.params as { id: string };

    return withTenant(req.hotelId, (tx) =>
      tx`select id, rate_plan_id, override_date, rate_cents, created_at
         from rate_overrides where rate_plan_id = ${id} order by override_date`,
    );
  });

  app.delete("/rate-overrides/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    const result = await withTenant(req.hotelId, (tx) =>
      tx`delete from rate_overrides where id = ${id}`,
    );

    if (result.count === 0) {
      return reply.code(404).send({ error: "Rate override not found" });
    }

    return reply.code(204).send();
  });
}
