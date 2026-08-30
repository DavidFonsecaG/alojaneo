import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyToken } from "../lib/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    hotelId: string;
    userId: string;
    role: string;
  }
}

export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Missing bearer token" });
  }

  try {
    const payload = verifyToken(header.slice("Bearer ".length));
    req.hotelId = payload.hotelId;
    req.userId = payload.userId;
    req.role = payload.role;
  } catch {
    return reply.code(401).send({ error: "Invalid or expired token" });
  }
}
