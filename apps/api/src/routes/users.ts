import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sqlUnscoped, withTenant } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { hashPassword } from "../lib/auth.js";

const roleEnum = z.enum(["admin", "general"]);
// { module: { action: boolean } }
const permissionsSchema = z.record(z.string(), z.record(z.string(), z.boolean()));

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: roleEnum.default("general"),
  permissions: permissionsSchema.optional(),
});

const updateUserSchema = z
  .object({
    role: roleEnum.optional(),
    permissions: permissionsSchema.optional(),
  })
  .refine((b) => b.role !== undefined || b.permissions !== undefined, {
    message: "At least one field must be provided",
  });

const memberSelect = (tx: import("postgres").TransactionSql) => tx`
  select hu.id, hu.user_id, hu.role, hu.permissions, hu.created_at, u.email
  from hotel_users hu
  join users u on u.id = hu.user_id
`;

export async function userRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  const canView = requirePermission("users", "view");
  const canManage = requirePermission("users", "manage");

  // GET /users — hotel members with their role + permissions.
  app.get("/users", { preHandler: canView }, async (req) => {
    return withTenant(
      req.hotelId,
      (tx) => tx`${memberSelect(tx)} order by hu.created_at`,
    );
  });

  // POST /users — create a staff account and add it to this hotel. Admins get
  // implicit full access, so their permissions are stored as NULL.
  app.post("/users", { preHandler: canManage }, async (req, reply) => {
    const body = createUserSchema.parse(req.body);
    const perms = body.role === "admin" ? null : (body.permissions ?? {});
    const passwordHash = await hashPassword(body.password);

    try {
      const member = await withTenant(req.hotelId, async (tx) => {
        // users has no RLS, so this insert is fine inside the tenant tx and
        // keeps user + membership atomic.
        const [user] = await tx`
          insert into users (email, password_hash)
          values (${body.email}, ${passwordHash})
          returning id, email
        `;
        const [hu] = await tx`
          insert into hotel_users (hotel_id, user_id, role, permissions)
          values (${req.hotelId}, ${user.id}, ${body.role}, ${perms === null ? null : tx.json(perms)})
          returning id, user_id, role, permissions, created_at
        `;
        return { ...hu, email: user.email };
      });
      return reply.code(201).send(member);
    } catch (err) {
      // Unique violation on users.email
      if ((err as { code?: string })?.code === "23505") {
        return reply.code(409).send({ error: "Email already registered" });
      }
      throw err;
    }
  });

  // PATCH /users/:id — change a member's role and/or permissions.
  app.patch<{ Params: { id: string } }>(
    "/users/:id",
    { preHandler: canManage },
    async (req, reply) => {
      const { id } = req.params;
      const body = updateUserSchema.parse(req.body);

      const result = await withTenant(req.hotelId, async (tx) => {
        const [existing] = await tx`
          select id, user_id, role from hotel_users where id = ${id}
        `;
        if (!existing) return { notFound: true as const };

        // Don't let an admin change their own role and risk locking themselves
        // out, and don't demote the last remaining admin.
        const nextRole = body.role ?? existing.role;
        if (existing.user_id === req.userId && nextRole !== existing.role) {
          return { ownRole: true as const };
        }
        if (existing.role === "admin" && nextRole !== "admin") {
          const [{ count }] = await tx`
            select count(*)::int as count from hotel_users where role = 'admin'
          `;
          if (count <= 1) return { lastAdmin: true as const };
        }

        const permsProvided = body.permissions !== undefined;
        await tx`
          update hotel_users set
            role = ${nextRole},
            permissions = ${
              nextRole === "admin"
                ? null
                : permsProvided
                  ? tx.json(body.permissions!)
                  : tx`permissions`
            }
          where id = ${id}
        `;
        const [row] = await tx`${memberSelect(tx)} where hu.id = ${id}`;
        return { row };
      });

      if ("notFound" in result)
        return reply.code(404).send({ error: "User not found" });
      if ("ownRole" in result)
        return reply
          .code(409)
          .send({ error: "You can't change your own role." });
      if ("lastAdmin" in result)
        return reply
          .code(409)
          .send({ error: "There must be at least one admin." });
      return result.row;
    },
  );

  // DELETE /users/:id — remove a member from this hotel.
  app.delete<{ Params: { id: string } }>(
    "/users/:id",
    { preHandler: canManage },
    async (req, reply) => {
      const { id } = req.params;

      const result = await withTenant(req.hotelId, async (tx) => {
        const [target] = await tx`
          select id, user_id, role from hotel_users where id = ${id}
        `;
        if (!target) return { notFound: true as const };
        if (target.user_id === req.userId) return { self: true as const };
        if (target.role === "admin") {
          const [{ count }] = await tx`
            select count(*)::int as count from hotel_users where role = 'admin'
          `;
          if (count <= 1) return { lastAdmin: true as const };
        }
        await tx`delete from hotel_users where id = ${id}`;
        return { ok: true as const, userId: target.user_id as string };
      });

      if ("notFound" in result)
        return reply.code(404).send({ error: "User not found" });
      if ("self" in result)
        return reply
          .code(409)
          .send({ error: "You can't remove your own account." });
      if ("lastAdmin" in result)
        return reply
          .code(409)
          .send({ error: "Can't remove the last admin." });

      // One hotel per user in this model, so removing the membership removes
      // the account (users has no RLS). This frees the email for re-use; the
      // FK cascade also clears any stray memberships.
      await sqlUnscoped`delete from users where id = ${result.userId}`;
      return reply.code(204).send();
    },
  );
}
