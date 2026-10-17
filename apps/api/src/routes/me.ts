import type { FastifyInstance } from "fastify";
import { sqlUnscoped } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";

// The current user's identity for the account menu. Available to any
// authenticated staff member (not just admins).
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
}
