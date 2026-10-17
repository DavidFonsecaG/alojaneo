import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sqlUnscoped } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { hashPassword, verifyPassword } from "../lib/auth.js";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

// The current user's own account: identity for the account menu, plus
// self-service settings (change password). Available to any authenticated
// staff member — these are per-user, not per-hotel, so no permission gate.
export async function meRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/me", async (req, reply) => {
    const [user] = await sqlUnscoped`
      select email from users where id = ${req.userId}
    `;
    const [hotel] = await sqlUnscoped`
      select name, slug from hotels where id = ${req.hotelId}
    `;
    if (!user) return reply.code(404).send({ error: "User not found" });
    return {
      email: user.email,
      role: req.role,
      hotelName: hotel?.name ?? "",
      hotelSlug: hotel?.slug ?? "",
    };
  });

  // PATCH /me/password — change your own password. Requires the current
  // password (so a stolen session can't silently lock the owner out), and the
  // new one must actually differ. users has no RLS, so a plain unscoped
  // update keyed on the authenticated user id is correct and safe here.
  app.patch("/me/password", async (req, reply) => {
    const body = changePasswordSchema.parse(req.body);

    const [user] = await sqlUnscoped`
      select password_hash from users where id = ${req.userId}
    `;
    if (!user) return reply.code(404).send({ error: "User not found" });

    const ok = await verifyPassword(body.currentPassword, user.password_hash);
    if (!ok) {
      return reply.code(400).send({ error: "Current password is incorrect." });
    }
    if (body.currentPassword === body.newPassword) {
      return reply
        .code(400)
        .send({ error: "New password must be different from the current one." });
    }

    const passwordHash = await hashPassword(body.newPassword);
    await sqlUnscoped`
      update users set password_hash = ${passwordHash} where id = ${req.userId}
    `;
    return { ok: true };
  });
}
