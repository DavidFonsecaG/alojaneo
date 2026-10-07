import type { FastifyRequest, FastifyReply } from "fastify";
import { sqlUnscoped } from "../db.js";
import { verifyPlatformToken } from "../lib/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    platformUserId: string;
  }
}

// Gate for the owner-only /platform/* routes: a valid platform token AND the
// user still flagged is_platform_owner in the database (so revoking access
// takes effect immediately, not only on token expiry).
export async function requirePlatformOwner(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Missing bearer token" });
  }
  try {
    const payload = verifyPlatformToken(header.slice("Bearer ".length));
    const [user] = await sqlUnscoped`
      select is_platform_owner from users where id = ${payload.userId}
    `;
    if (!user?.is_platform_owner) {
      return reply.code(403).send({ error: "Platform access required" });
    }
    req.platformUserId = payload.userId;
  } catch {
    return reply.code(401).send({ error: "Invalid or expired token" });
  }
}
