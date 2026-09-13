import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sqlUnscoped } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";

const updateSettingsSchema = z
  .object({
    depositPolicyType: z.enum(["full", "percentage", "none"]).optional(),
    depositPercentage: z.number().int().min(1).max(100).optional(),
    taxRate: z.number().int().min(0).optional(),
    tourismTaxRate: z.number().int().min(0).optional(),
    currency: z.string().min(1).optional(),
  })
  .refine(
    (b) =>
      b.depositPolicyType !== "percentage" || b.depositPercentage !== undefined,
    {
      message:
        "depositPercentage is required when depositPolicyType is 'percentage'",
      path: ["depositPercentage"],
    },
  );

const updateProfileSchema = z
  .object({
    name: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
    // Branding for the public booking engine. An empty string clears the value
    // (removes the banner / resets to the default accent).
    bannerUrl: z.string().max(8_000_000).optional(),
    bannerPosition: z.number().int().min(0).max(100).optional(),
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "accentColor must be a hex like #0c4a6e")
      .or(z.literal(""))
      .optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });

// A banner can be a few MB as a base64 data URL, so lift the body limit on the
// profile PATCH (default is 1 MB).
const PROFILE_BODY_LIMIT = 8 * 1024 * 1024;

export async function hotelSettingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/hotel/settings", async (req, reply) => {
    const [settings] = await sqlUnscoped`
      select deposit_policy_type, deposit_percentage, tax_rate, tourism_tax_rate, currency
      from hotels
      where id = ${req.hotelId}
    `;

    if (!settings) {
      return reply.code(404).send({ error: "Hotel not found" });
    }

    return settings;
  });

  app.patch("/hotel/settings", async (req, reply) => {
    const body = updateSettingsSchema.parse(req.body);

    const [updated] = await sqlUnscoped`
      update hotels set
        deposit_policy_type = coalesce(${body.depositPolicyType ?? null}, deposit_policy_type),
        deposit_percentage = coalesce(${body.depositPercentage ?? null}, deposit_percentage),
        tax_rate = coalesce(${body.taxRate ?? null}, tax_rate),
        tourism_tax_rate = coalesce(${body.tourismTaxRate ?? null}, tourism_tax_rate),
        currency = coalesce(${body.currency ?? null}, currency)
      where id = ${req.hotelId}
      returning deposit_policy_type, deposit_percentage, tax_rate, tourism_tax_rate, currency
    `;

    if (!updated) {
      return reply.code(404).send({ error: "Hotel not found" });
    }

    return updated;
  });

  app.get("/hotel/profile", async (req, reply) => {
    const [profile] = await sqlUnscoped`
      select id, name, slug, banner_url, banner_position, accent_color, created_at
      from hotels
      where id = ${req.hotelId}
    `;

    if (!profile) {
      return reply.code(404).send({ error: "Hotel not found" });
    }

    return profile;
  });

  app.patch(
    "/hotel/profile",
    { bodyLimit: PROFILE_BODY_LIMIT },
    async (req, reply) => {
      const body = updateProfileSchema.parse(req.body);

      // name/slug use coalesce (only overwrite when provided). banner_url and
      // accent_color must also support *clearing*, so an empty string maps to
      // NULL while `undefined` (field omitted) keeps the current value.
      const [updated] = await sqlUnscoped`
        update hotels set
          name = coalesce(${body.name ?? null}, name),
          slug = coalesce(${body.slug ?? null}, slug),
          banner_url = ${
            body.bannerUrl === undefined
              ? sqlUnscoped`banner_url`
              : body.bannerUrl || null
          },
          banner_position = coalesce(${body.bannerPosition ?? null}, banner_position),
          accent_color = ${
            body.accentColor === undefined
              ? sqlUnscoped`accent_color`
              : body.accentColor || null
          }
        where id = ${req.hotelId}
        returning id, name, slug, banner_url, banner_position, accent_color, created_at
      `;

      if (!updated) {
        return reply.code(404).send({ error: "Hotel not found" });
      }

      return updated;
    },
  );
}
