import type { FastifyInstance } from "fastify";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { sqlUnscoped, withUserContext } from "../db.js";
import {
  hashPassword,
  verifyPassword,
  signToken,
  signSignupTicket,
  verifySignupTicket,
} from "../lib/auth.js";
import { consumeLoginCode, issueLoginCode } from "../lib/loginCode.js";
import { getMailer } from "../mail/index.js";

const signupSchema = z.object({
  hotelName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

// Build a URL-safe slug from a hotel name. Accents are stripped so Spanish
// names (ñ, á, …) produce clean ASCII slugs.
function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "hotel"
  );
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const verifyCodeSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, "code must be 6 digits"),
});

const signupVerifySchema = z.object({
  ticket: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, "code must be 6 digits"),
});

export const defaultAdminPermissions = {
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

// Create a hotel plus its first user (always 'admin'), deriving a unique
// name-based slug. Hotel + user creation happens unscoped (no tenant exists
// yet), but once the hotel row exists we set app.current_hotel_id within the
// same transaction before inserting into hotel_users — that table's RLS policy
// requires it even for the very first membership row of a brand new hotel.
async function createHotelWithAdmin(
  hotelName: string,
  email: string,
  passwordHash: string,
) {
  const base = slugify(hotelName);
  const rows = await sqlUnscoped`
    select slug from hotels where slug = ${base} or slug like ${base + "-%"}
  `;
  const taken = new Set(rows.map((r) => r.slug as string));
  let slug = base;
  if (taken.has(slug)) {
    let n = 2;
    while (taken.has(`${base}-${n}`)) n++;
    slug = `${base}-${n}`;
  }

  const insert = (hotelSlug: string) =>
    sqlUnscoped.begin(async (tx) => {
      const [hotel] = await tx`
        insert into hotels (name, slug) values (${hotelName}, ${hotelSlug})
        returning id, name, slug
      `;
      await tx`select set_config('app.current_hotel_id', ${hotel.id}, true)`;
      const [user] = await tx`
        insert into users (email, password_hash) values (${email}, ${passwordHash})
        returning id, email
      `;
      await tx`
        insert into hotel_users (hotel_id, user_id, role, permissions)
        values (${hotel.id}, ${user.id}, 'admin', ${JSON.stringify(defaultAdminPermissions)}::jsonb)
      `;
      return { hotel, user };
    });

  try {
    return await insert(slug);
  } catch (err) {
    const e = err as { code?: string; constraint_name?: string };
    // A slug that raced to taken retries once; an email collision propagates
    // (the caller maps it to 409).
    if (e.code === "23505" && !String(e.constraint_name ?? "").includes("email")) {
      return await insert(`${base}-${Math.random().toString(36).slice(2, 6)}`);
    }
    throw err;
  }
}

export async function authRoutes(app: FastifyInstance) {
  // Signup step 1: validate, email a 6-digit code, and return a short-lived
  // signed ticket carrying the pending account. Nothing is written to the DB
  // yet — the hotel is only created once the code is confirmed (step 2), so a
  // fake or mistyped email leaves no orphan account.
  app.post("/auth/signup", async (req, reply) => {
    const body = signupSchema.parse(req.body);

    const existing = await sqlUnscoped`
      select id from users where email = ${body.email}
    `;
    if (existing.length > 0) {
      return reply.code(409).send({ error: "Email already registered" });
    }

    const passwordHash = await hashPassword(body.password);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const codeHash = await hashPassword(code);
    const ticket = signSignupTicket({
      hotelName: body.hotelName,
      email: body.email,
      passwordHash,
      codeHash,
    });
    try {
      await getMailer().sendVerificationCode(body.email, code);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[mail] signup code failed:", (err as Error).message);
      return reply
        .code(502)
        .send({ error: "Couldn't send the verification email. Please try again." });
    }

    return reply.send({ challenge: "code", email: body.email, ticket });
  });

  // Signup step 2: confirm the emailed code against the ticket, then create the
  // hotel + first admin user and issue the session token.
  app.post("/auth/signup/verify", async (req, reply) => {
    const body = signupVerifySchema.parse(req.body);

    let ticket;
    try {
      ticket = verifySignupTicket(body.ticket);
    } catch {
      return reply
        .code(401)
        .send({ error: "Your signup session expired. Please sign up again." });
    }

    if (!(await verifyPassword(body.code, ticket.codeHash))) {
      return reply.code(401).send({ error: "Invalid or expired code" });
    }

    const existing = await sqlUnscoped`
      select id from users where email = ${ticket.email}
    `;
    if (existing.length > 0) {
      return reply.code(409).send({ error: "Email already registered" });
    }

    let result;
    try {
      result = await createHotelWithAdmin(
        ticket.hotelName,
        ticket.email,
        ticket.passwordHash,
      );
    } catch (err) {
      const e = err as { code?: string; constraint_name?: string };
      if (e.code === "23505" && String(e.constraint_name ?? "").includes("email")) {
        return reply.code(409).send({ error: "Email already registered" });
      }
      throw err;
    }

    const token = signToken({
      userId: result.user.id,
      hotelId: result.hotel.id,
      role: "admin",
    });

    return reply.code(201).send({ token, hotel: result.hotel });
  });

  // Step 1: check the password, then email a one-time code. No token yet.
  app.post("/auth/login", async (req, reply) => {
    const body = loginSchema.parse(req.body);

    const [user] = await sqlUnscoped`
      select id, email, password_hash from users where email = ${body.email}
    `;
    if (!user || !(await verifyPassword(body.password, user.password_hash))) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    // Only members can log into the staff app — check before spending a code.
    const [membership] = await withUserContext(
      user.id,
      (tx) =>
        tx`select 1 from hotel_users where user_id = ${user.id} limit 1`,
    );
    if (!membership) {
      return reply.code(403).send({ error: "User has no hotel membership" });
    }

    try {
      await issueLoginCode(user.id, user.email);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[mail] login code failed:", (err as Error).message);
      return reply
        .code(502)
        .send({ error: "Couldn't send the login code. Please try again." });
    }
    return reply.send({ challenge: "code", email: user.email });
  });

  // Step 2: verify the emailed code and issue the 24h session token.
  app.post("/auth/verify-code", async (req, reply) => {
    const body = verifyCodeSchema.parse(req.body);

    const [user] = await sqlUnscoped`
      select id from users where email = ${body.email}
    `;
    if (!user) return reply.code(401).send({ error: "Invalid or expired code" });

    if (!(await consumeLoginCode(user.id, body.code))) {
      return reply.code(401).send({ error: "Invalid or expired code" });
    }

    // See the hotel_users_self_lookup RLS policy for why this uses
    // withUserContext rather than a plain unscoped query.
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
