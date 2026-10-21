import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getHotelPaymentConfig,
  saveHotelPaymentConfig,
  type HotelPaymentConfig,
} from "../payments/index.js";
import { reconcileHotelPayments } from "../payments/reconcile.js";

const PROVIDERS = ["mock", "kushki", "payphone"] as const;

const updateSchema = z
  .object({
    provider: z.enum(PROVIDERS).optional(),
    // null / "" clears the public key; undefined keeps it.
    publicKey: z.string().max(500).nullable().optional(),
    // Write-only secret; "" clears it, undefined keeps the stored one.
    privateKey: z.string().max(4000).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });

function webhookBaseUrl(): string {
  return process.env.API_PUBLIC_URL ?? "http://localhost:3001";
}

// What the admin UI sees — never the private key itself, only whether one is on
// file, plus the webhook URL to paste into the gateway dashboard.
function toView(cfg: HotelPaymentConfig) {
  return {
    provider: cfg.provider,
    publicKey: cfg.publicKey,
    enabled: cfg.enabled,
    hasPrivateKey: !!cfg.privateKey,
    webhookUrl: cfg.webhookToken
      ? `${webhookBaseUrl()}/webhooks/payments/${cfg.webhookToken}`
      : null,
  };
}

export async function hotelPaymentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);
  // Gateway credentials are sensitive — admins only.
  app.addHook("preHandler", async (req, reply) => {
    if (req.role !== "admin") {
      return reply.code(403).send({ error: "Admin access required" });
    }
  });

  app.get("/hotel/payment-settings", async (req, reply) => {
    const cfg = await getHotelPaymentConfig(req.hotelId);
    if (!cfg) return reply.code(404).send({ error: "Hotel not found" });
    return toView(cfg);
  });

  app.put("/hotel/payment-settings", async (req, reply) => {
    const body = updateSchema.parse(req.body);
    await saveHotelPaymentConfig(req.hotelId, body);
    const cfg = await getHotelPaymentConfig(req.hotelId);
    if (!cfg) return reply.code(404).send({ error: "Hotel not found" });
    return toView(cfg);
  });

  // Manually sweep stuck 'pending' deposits via the gateway's status API.
  // (A scheduled job can hit this per hotel later.)
  app.post("/hotel/payment-settings/reconcile", async (req) => {
    return reconcileHotelPayments(req.hotelId);
  });
}
