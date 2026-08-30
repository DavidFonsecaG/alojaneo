import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sqlUnscoped, withUserContext } from "../db.js";
import { hashPassword, verifyPassword, signToken } from "../lib/auth.js";

const signupSchema = z.object({
  hotelName: z.string().min(1),
  hotelSlug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, hyphens"),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const defaultAdminPermissions = {
  reservations: { view: true, create: true, update: true, cancel: true },
  rooms: { view: true, manage: true },
  rate_plans: { view: true, manage: true },
  guests: { view: true, manage: true },
  payments: { view: true, manage: true },
  reports: { view: true },
  users: { view: true, manage: true },
  housekeeping: { view: true, manage: true },
  settings: { view: true, manage: true },
};

export async function authRoutes(app: FastifyInstance) {
  // Creates a new hotel account plus its first user, who is always 'admin'.
  // This is the one place a hotel row gets created outside any existing
  // tenant context, which is correct — there's no tenant to scope to yet.
  app.post("/auth/signup", async (req, reply) => {
    const body = signupSchema.parse(req.body);
    const passwordHash = await hashPassword(body.password);

    const existing = await sqlUnscoped`
      select id from users where email = ${body.email}
    `;
    if (existing.length > 0) {
      return reply.code(409).send({ error: "Email already registered" });
    }

    // Hotel + user creation happens unscoped (no tenant exists yet), but
    // once the hotel row is created we DO set app.current_hotel_id within
    // this same transaction before inserting into hotel_users — that
    // table's RLS policy requires it, even for the very first membership
    // row of a brand new hotel. There's no exception carved out for
    // "first row ever" — the context just gets established as soon as
    // it's knowable, which is the moment the hotel id exists.
    const result = await sqlUnscoped.begin(async (tx) => {
      const [hotel] = await tx`
        insert into hotels (name, slug) values (${body.hotelName}, ${body.hotelSlug})
        returning id, name, slug
      `;
      await tx`select set_config('app.current_hotel_id', ${hotel.id}, true)`;
      const [user] = await tx`
        insert into users (email, password_hash) values (${body.email}, ${passwordHash})
        returning id, email
      `;
      await tx`
        insert into hotel_users (hotel_id, user_id, role, permissions)
        values (${hotel.id}, ${user.id}, 'admin', ${JSON.stringify(defaultAdminPermissions)}::jsonb)
      `;
      return { hotel, user };
    });

    const token = signToken({
      userId: result.user.id,
      hotelId: result.hotel.id,
      role: "admin",
    });

    return reply.code(201).send({ token, hotel: result.hotel });
  });

  app.post("/auth/login", async (req, reply) => {
    const body = loginSchema.parse(req.body);

    const [user] = await sqlUnscoped`
      select id, password_hash from users where email = ${body.email}
    `;
    if (!user || !(await verifyPassword(body.password, user.password_hash))) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    // A user could in theory belong to more than one hotel later; for this
    // slice we take the first membership found. This is the one place we
    // set app.current_user_id instead of app.current_hotel_id — see the
    // hotel_users_self_lookup RLS policy for why a plain unscoped query
    // would otherwise return zero rows here.
    const [membership] = await withUserContext(user.id, (tx) => tx`
      select hotel_id, role, permissions from hotel_users where user_id = ${user.id} limit 1
    `);
    if (!membership) {
      return reply.code(403).send({ error: "User has no hotel membership" });
    }

    const token = signToken({
      userId: user.id,
      hotelId: membership.hotel_id,
      role: membership.role,
    });

    return reply.send({ token, permissions: membership.permissions });
  });
}
