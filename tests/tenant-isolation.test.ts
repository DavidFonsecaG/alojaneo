import { describe, it, expect, beforeAll } from "vitest";
import { buildApp } from "../apps/api/src/index.js";
import type { FastifyInstance } from "fastify";

describe("tenant isolation through the real API + connection pool", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  async function signup(hotelName: string, slug: string, email: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { hotelName, hotelSlug: slug, email, password: "password123" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.token).toBeDefined();
    expect(body.hotel).toBeDefined();
    expect(body.hotel.id).toBeDefined();
    expect(body.hotel.name).toBe(hotelName);
    expect(body.hotel.slug).toBe(slug);
    return body.token as string;
  }

  it("lets a hotel create and list its own room types", async () => {
    const token = await signup(
      "Hotel Playa Inn",
      `playa-inn-${Date.now()}`,
      `admin-${Date.now()}@playa.test`,
    );

    const create = await app.inject({
      method: "POST",
      url: "/room-types",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Standard", maxOccupancy: 2 },
    });
    expect(create.statusCode).toBe(201);

    const list = await app.inject({
      method: "GET",
      url: "/room-types",
      headers: { authorization: `Bearer ${token}` },
    });
    const roomTypes = JSON.parse(list.body);
    expect(roomTypes).toHaveLength(1);
    expect(roomTypes[0].name).toBe("Standard");
  });

  it("never lets hotel B see hotel A's room types, even reusing pooled connections", async () => {
    const ts = Date.now();
    const tokenA = await signup("Hotel A", `hotel-a-${ts}`, `a-${ts}@test.com`);
    const tokenB = await signup("Hotel B", `hotel-b-${ts}`, `b-${ts}@test.com`);

    await app.inject({
      method: "POST",
      url: "/room-types",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: "Hotel A Suite", maxOccupancy: 4 },
    });

    // Fire interleaved requests for both tenants concurrently. With a
    // pooled connection, this is exactly the scenario where a `SET`
    // (instead of `SET LOCAL`) would leak context between requests that
    // happen to reuse the same underlying connection.
    const [listA1, listB1, listA2, listB2] = await Promise.all([
      app.inject({
        method: "GET",
        url: "/room-types",
        headers: { authorization: `Bearer ${tokenA}` },
      }),
      app.inject({
        method: "GET",
        url: "/room-types",
        headers: { authorization: `Bearer ${tokenB}` },
      }),
      app.inject({
        method: "GET",
        url: "/room-types",
        headers: { authorization: `Bearer ${tokenA}` },
      }),
      app.inject({
        method: "GET",
        url: "/room-types",
        headers: { authorization: `Bearer ${tokenB}` },
      }),
    ]);

    const namesA1 = JSON.parse(listA1.body).map((r: any) => r.name);
    const namesA2 = JSON.parse(listA2.body).map((r: any) => r.name);
    const namesB1 = JSON.parse(listB1.body).map((r: any) => r.name);
    const namesB2 = JSON.parse(listB2.body).map((r: any) => r.name);

    expect(namesA1).toEqual(["Hotel A Suite"]);
    expect(namesA2).toEqual(["Hotel A Suite"]);
    expect(namesB1).toEqual([]);
    expect(namesB2).toEqual([]);
  });

  it("rejects requests with no token", async () => {
    const res = await app.inject({ method: "GET", url: "/room-types" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a tampered token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/room-types",
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("lets a user log in after signup and access their hotel's data", async () => {
    const ts = Date.now();
    const email = `login-${ts}@test.com`;
    await signup("Login Test Hotel", `login-test-${ts}`, email);

    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: "password123" },
    });
    expect(loginRes.statusCode).toBe(200);
    const body = JSON.parse(loginRes.body);
    expect(body.token).toBeDefined();
    expect(body.permissions).toBeDefined();

    const list = await app.inject({
      method: "GET",
      url: "/room-types",
      headers: { authorization: `Bearer ${body.token}` },
    });
    expect(list.statusCode).toBe(200);
    expect(JSON.parse(list.body)).toEqual([]);
  });

  it("rejects login with the wrong password", async () => {
    const ts = Date.now();
    const email = `wrongpw-${ts}@test.com`;
    await signup("Wrong Password Hotel", `wrongpw-${ts}`, email);

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: "not-the-real-password" },
    });
    expect(res.statusCode).toBe(401);
  });

  // Regression test for a real bug found while building this: after a
  // transaction does `SET LOCAL app.current_hotel_id = ...` and commits,
  // Postgres does NOT revert the parameter to NULL on that connection —
  // it reverts to an empty string. A later, unrelated transaction reusing
  // the same pooled connection (e.g. a login, which never sets
  // app.current_hotel_id at all) would then see '' instead of NULL when
  // reading that setting, and casting '' to uuid throws. The RLS policies
  // must use nullif(..., '') before casting so this can't surface as a
  // 500 (or worse, an unexpected match) once the pool reuses a connection
  // a tenant-scoped request already touched.
  it("survives a login immediately after a tenant-scoped request reuses its pooled connection", async () => {
    const ts = Date.now();
    const email = `poolreuse-${ts}@test.com`;
    const token = await signup("Pool Reuse Hotel", `pool-reuse-${ts}`, email);

    // This sets app.current_hotel_id locally on whichever pooled
    // connection handles it, then commits.
    const listRes = await app.inject({
      method: "GET",
      url: "/room-types",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listRes.statusCode).toBe(200);

    // If that connection gets reused here and the policy doesn't guard
    // against the leftover empty string, this fails with a 500 instead
    // of succeeding.
    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: "password123" },
    });
    expect(loginRes.statusCode).toBe(200);
  });
});
