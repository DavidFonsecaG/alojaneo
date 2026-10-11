import { describe, it, expect, beforeAll } from "vitest";
import { buildApp } from "../apps/api/src/index.js";
import { getLastDevCode } from "../apps/api/src/mail/index.js";
import type { FastifyInstance } from "fastify";

// Covers /users CRUD, the self/own-role guards, and that a general user's
// permissions are actually enforced on gated routes.
describe("users & permissions", () => {
  let app: FastifyInstance;
  let token: string; // admin
  let adminMembershipId: string;
  const auth = () => ({ authorization: `Bearer ${token}` });

  const staffEmail = `staff-${Date.now()}@test.com`;
  const staffPassword = "staffpass1";

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
    const ts = Date.now();
    const signup = JSON.parse(
      (
        await app.inject({
          method: "POST",
          url: "/auth/signup",
          payload: {
            hotelName: "Users Hotel",
            hotelSlug: `users-${ts}`,
            email: `admin-${ts}@test.com`,
            password: "password123",
          },
        })
      ).body,
    );
    token = signup.token;
  });

  it("lists the founding admin", async () => {
    const res = await app.inject({ method: "GET", url: "/users", headers: auth() });
    expect(res.statusCode).toBe(200);
    const rows = JSON.parse(res.body);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("admin");
    adminMembershipId = rows[0].id;
  });

  let staffId: string;

  it("creates a general user with a permission matrix", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/users",
      headers: auth(),
      payload: {
        email: staffEmail,
        password: staffPassword,
        role: "general",
        permissions: {
          reservations: { view: true, create: true },
          rooms: { view: true, manage: false },
        },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    staffId = body.id;
    expect(body.role).toBe("general");
    expect(body.permissions.rooms.manage).toBe(false);
  });

  it("rejects a duplicate email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/users",
      headers: auth(),
      payload: { email: staffEmail, password: "whatever8", role: "general" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("updates a member's permissions", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/users/${staffId}`,
      headers: auth(),
      payload: { permissions: { rooms: { view: true, manage: true } } },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).permissions.rooms.manage).toBe(true);
  });

  it("won't let an admin change their own role or remove themselves", async () => {
    const role = await app.inject({
      method: "PATCH",
      url: `/users/${adminMembershipId}`,
      headers: auth(),
      payload: { role: "general" },
    });
    expect(role.statusCode).toBe(409);

    const del = await app.inject({
      method: "DELETE",
      url: `/users/${adminMembershipId}`,
      headers: auth(),
    });
    expect(del.statusCode).toBe(409);
  });

  it("enforces a general user's permissions on gated routes", async () => {
    // Narrow the staff member back to no rooms:manage.
    await app.inject({
      method: "PATCH",
      url: `/users/${staffId}`,
      headers: auth(),
      payload: { permissions: { rooms: { view: true, manage: false } } },
    });

    // Log the staff member in via the email-code flow.
    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: staffEmail, password: staffPassword },
    });
    expect(loginRes.statusCode).toBe(200);
    const code = getLastDevCode(staffEmail);
    const verify = await app.inject({
      method: "POST",
      url: "/auth/verify-code",
      payload: { email: staffEmail, code },
    });
    const staffToken = JSON.parse(verify.body).token;
    const staffAuth = { authorization: `Bearer ${staffToken}` };

    // rooms:manage is required to create a room → denied.
    const createRoom = await app.inject({
      method: "POST",
      url: "/rooms",
      headers: staffAuth,
      payload: { roomTypeId: "00000000-0000-0000-0000-000000000000", roomNumber: "9" },
    });
    expect(createRoom.statusCode).toBe(403);

    // A plain authenticated read they do have access to still works.
    const list = await app.inject({
      method: "GET",
      url: "/room-types",
      headers: staffAuth,
    });
    expect(list.statusCode).toBe(200);
  });

  it("removes a member", async () => {
    const del = await app.inject({
      method: "DELETE",
      url: `/users/${staffId}`,
      headers: auth(),
    });
    expect(del.statusCode).toBe(204);

    const rows = JSON.parse(
      (await app.inject({ method: "GET", url: "/users", headers: auth() })).body,
    );
    expect(rows).toHaveLength(1);
  });
});
