import { describe, it, expect, beforeAll } from "vitest";
import { buildApp } from "../apps/api/src/index.js";
import { getLastDevCode } from "../apps/api/src/mail/index.js";
import { sqlUnscoped } from "../apps/api/src/db.js";
import { signupHotel } from "./helpers.js";
import type { FastifyInstance } from "fastify";

// Covers the owner-only platform console: OTP login that issues a platform
// token, the is_platform_owner gate, and hotel list/detail/create/delete.
describe("platform owner console", () => {
  let app: FastifyInstance;
  let platformToken: string;
  let hotelAdminToken: string; // a normal (non-owner) admin
  let ownerHotelId: string;

  const ts = Date.now();
  const ownerEmail = `owner-${ts}@test.com`;
  const ownerPassword = "ownerpass1";
  const plat = () => ({ authorization: `Bearer ${platformToken}` });

  beforeAll(async () => {
    app = buildApp();
    await app.ready();

    // The owner is a signed-up user flagged as platform owner.
    const ownerSignup = await signupHotel(app, {
      hotelName: "Owner Hotel",
      email: ownerEmail,
      password: ownerPassword,
    });
    ownerHotelId = ownerSignup.hotel.id;
    await sqlUnscoped`update users set is_platform_owner = true where email = ${ownerEmail}`;

    // A separate ordinary hotel admin (not a platform owner).
    hotelAdminToken = (
      await signupHotel(app, {
        hotelName: "Ordinary Hotel",
        email: `ordinary-${ts}@test.com`,
        password: "password123",
      })
    ).token;
  });

  it("rejects a non-owner at the platform login", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/platform/auth/login",
      payload: { email: `ordinary-${ts}@test.com`, password: "password123" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("logs the owner in via the email-code flow", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/platform/auth/login",
      payload: { email: ownerEmail, password: ownerPassword },
    });
    expect(login.statusCode).toBe(200);
    expect(JSON.parse(login.body).challenge).toBe("code");

    const code = getLastDevCode(ownerEmail);
    const verify = await app.inject({
      method: "POST",
      url: "/platform/auth/verify-code",
      payload: { email: ownerEmail, code },
    });
    expect(verify.statusCode).toBe(200);
    platformToken = JSON.parse(verify.body).token;
    expect(platformToken).toBeDefined();
  });

  it("gates /platform routes to the owner token", async () => {
    const noToken = await app.inject({ method: "GET", url: "/platform/hotels" });
    expect(noToken.statusCode).toBe(401);

    const hotelToken = await app.inject({
      method: "GET",
      url: "/platform/hotels",
      headers: { authorization: `Bearer ${hotelAdminToken}` },
    });
    expect(hotelToken.statusCode).toBe(401); // a hotel token is not a platform token
  });

  it("lists all hotels", async () => {
    const res = await app.inject({ method: "GET", url: "/platform/hotels", headers: plat() });
    expect(res.statusCode).toBe(200);
    const hotels = JSON.parse(res.body);
    expect(hotels.some((h: { id: string }) => h.id === ownerHotelId)).toBe(true);
  });

  let createdId: string;

  it("creates a hotel with its first admin", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/platform/hotels",
      headers: plat(),
      payload: {
        name: "Fresh Hotel",
        slug: `fresh-${ts}`,
        adminEmail: `fresh-admin-${ts}@test.com`,
        adminPassword: "freshpass1",
      },
    });
    expect(res.statusCode).toBe(201);
    createdId = JSON.parse(res.body).id;

    // Duplicate slug is rejected.
    const dup = await app.inject({
      method: "POST",
      url: "/platform/hotels",
      headers: plat(),
      payload: {
        name: "Dupe",
        slug: `fresh-${ts}`,
        adminEmail: `dupe-${ts}@test.com`,
        adminPassword: "dupepass1",
      },
    });
    expect(dup.statusCode).toBe(409);
  });

  it("returns hotel detail with counts and its admin", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/platform/hotels/${createdId}`,
      headers: plat(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.counts).toEqual({ rooms: 0, reservations: 0, guests: 0 });
    expect(body.users).toHaveLength(1);
    expect(body.users[0].role).toBe("admin");
  });

  it("deletes a hotel", async () => {
    const del = await app.inject({
      method: "DELETE",
      url: `/platform/hotels/${createdId}`,
      headers: plat(),
    });
    expect(del.statusCode).toBe(204);

    const gone = await app.inject({
      method: "GET",
      url: `/platform/hotels/${createdId}`,
      headers: plat(),
    });
    expect(gone.statusCode).toBe(404);
  });
});
