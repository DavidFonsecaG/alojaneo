import type { FastifyRequest, FastifyReply } from "fastify";
import { withTenant } from "../db.js";

type PermissionModule =
  | "reservations"
  | "rooms"
  | "rate_plans"
  | "guests"
  | "payments"
  | "reports"
  | "users"
  | "housekeeping"
  | "settings";

type PermissionAction = "view" | "create" | "update" | "cancel" | "manage";

export function requirePermission(
  module: PermissionModule,
  action: PermissionAction,
) {
  return async function (
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    // Admin has implicit full access — skip all permission checks.
    if (req.role === "admin") return;

    // Look up the user's permissions from the database. The JWT only carries
    // the role, not the full permissions object, so we need to query for it.
    const [membership] = await withTenant(req.hotelId, (tx) =>
      tx`select permissions from hotel_users where user_id = ${req.userId} and hotel_id = ${req.hotelId}`,
    );

    // If the user has no membership row or no permissions JSON at all, deny.
    if (!membership?.permissions) {
      return reply.code(403).send({ error: "Insufficient permissions" });
    }

    const perms = membership.permissions as Record<
      string,
      Record<string, boolean>
    >;
    const modulePerms = perms[module];

    if (!modulePerms || !modulePerms[action]) {
      return reply.code(403).send({ error: "Insufficient permissions" });
    }
  };
}
