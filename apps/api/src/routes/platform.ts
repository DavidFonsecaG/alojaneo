import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sqlUnscoped, withTenant } from "../db.js";
import {
  hashPassword,
  signPlatformToken,
  verifyPassword,
} from "../lib/auth.js";
import { consumeLoginCode, issueLoginCode } from "../lib/loginCode.js";
import { requirePlatformOwner } from "../middleware/requirePlatformOwner.js";
import { defaultAdminPermissions } from "./auth.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
const verifyCodeSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, "code must be 6 digits"),
});
const createHotelSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, hyphens"),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
});

// Cross-hotel console for the platform owner (the developer running the SaaS).
// Its own OTP login issues a platform token (no hotel/role), and the /platform
// data routes are gated to the owner.
export async function platformRoutes(app: FastifyInstance) {
  // ── Owner login (public, same OTP flow, owner-only) ────────────────
  app.post("/platform/auth/login", async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);
    const [user] = await sqlUnscoped`
      select id, email, password_hash, is_platform_owner
      from users where email = ${email}
    `;
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }
    if (!user.is_platform_owner) {
      return reply.code(403).send({ error: "Not a platform owner" });
    }
    await issueLoginCode(user.id, user.email);
    return reply.send({ challenge: "code", email: user.email });
  });

  app.post("/platform/auth/verify-code", async (req, reply) => {
    const { email, code } = verifyCodeSchema.parse(req.body);
    const [user] = await sqlUnscoped`
      select id, is_platform_owner from users where email = ${email}
    `;
    if (!user || !user.is_platform_owner) {
      return reply.code(401).send({ error: "Invalid or expired code" });
    }
    if (!(await consumeLoginCode(user.id, code))) {
      return reply.code(401).send({ error: "Invalid or expired code" });
    }
    return reply.send({ token: signPlatformToken(user.id) });
  });

  // ── Owner-only data routes ─────────────────────────────────────────
  app.get(
    "/platform/hotels",
    { preHandler: requirePlatformOwner },
    async () =>
      sqlUnscoped`
        select id, name, slug, currency, deposit_policy_type,
               deposit_percentage, banner_url is not null as has_banner,
               booking_seq, created_at
        from hotels
        order by created_at desc
      `,
  );

  app.get<{ Params: { id: string } }>(
    "/platform/hotels/:id",
    { preHandler: requirePlatformOwner },
    async (req, reply) => {
      const { id } = req.params;
      const [hotel] = await sqlUnscoped`
        select id, name, slug, currency, deposit_policy_type,
               deposit_percentage, booking_seq, created_at
        from hotels where id = ${id}
      `;
      if (!hotel) return reply.code(404).send({ error: "Hotel not found" });

      // Drill into the hotel's own (RLS-protected) data by setting its context.
      const { users, counts } = await withTenant(id, async (tx) => {
        const users = await tx`
          select hu.id, hu.role, u.email, hu.created_at
          from hotel_users hu join users u on u.id = hu.user_id
          order by hu.created_at
        `;
        const [counts] = await tx`
          select
            (select count(*)::int from rooms) as rooms,
            (select count(*)::int from reservations) as reservations,
            (select count(*)::int from guests) as guests
        `;
        return { users, counts };
      });

      return { ...hotel, users, counts };
    },
  );

  app.post(
    "/platform/hotels",
    { preHandler: requirePlatformOwner },
    async (req, reply) => {
      const body = createHotelSchema.parse(req.body);
      const passwordHash = await hashPassword(body.adminPassword);
      try {
        const hotel = await sqlUnscoped.begin(async (tx) => {
          const [hotel] = await tx`
            insert into hotels (name, slug) values (${body.name}, ${body.slug})
            returning id, name, slug, currency, created_at
          `;
          await tx`select set_config('app.current_hotel_id', ${hotel.id}, true)`;
          const [user] = await tx`
            insert into users (email, password_hash)
            values (${body.adminEmail}, ${passwordHash})
            returning id
          `;
          await tx`
            insert into hotel_users (hotel_id, user_id, role, permissions)
            values (${hotel.id}, ${user.id}, 'admin', ${tx.json(defaultAdminPermissions)})
          `;
          return hotel;
        });
        return reply.code(201).send(hotel);
      } catch (err) {
        // slug or email already taken
        if ((err as { code?: string })?.code === "23505") {
          return reply
            .code(409)
            .send({ error: "That slug or admin email is already in use." });
        }
        throw err;
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/platform/hotels/:id",
    { preHandler: requirePlatformOwner },
    async (req, reply) => {
      const [deleted] = await sqlUnscoped`
        delete from hotels where id = ${req.params.id} returning id
      `;
      if (!deleted) return reply.code(404).send({ error: "Hotel not found" });
      return reply.code(204).send();
    },
  );
}
