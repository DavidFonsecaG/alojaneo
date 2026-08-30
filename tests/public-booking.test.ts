import { describe, it, expect, beforeAll } from "vitest";
import { buildApp } from "../apps/api/src/index.js";
import type { FastifyInstance } from "fastify";

// The public booking engine reads and writes RLS-protected tables
// (room_types, rooms, rate_plans, guests, reservations, reservation_rooms)
// but is reached with no logged-in user. It works by resolving the hotel
// from the slug (hotels has no RLS) and then running every tenant-scoped
// query inside that hotel's context via withTenant. These tests exercise
// that path end to end — previously it had no coverage at all.
describe("public booking engine", () => {
  let app: FastifyInstance;
  let token: string;
  let hotelSlug: string;
  let roomTypeId: string;
  let ratePlanId: string;

  const checkIn = "2027-01-10";
  const checkOut = "2027-01-15";

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
    const ts = Date.now();

    const signupRes = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        hotelName: "Public Booking Hotel",
        hotelSlug: `public-book-${ts}`,
        email: `public-${ts}@test.com`,
        password: "password123",
      },
    });
    expect(signupRes.statusCode).toBe(201);
    const signup = JSON.parse(signupRes.body);
    token = signup.token;
    hotelSlug = signup.hotel.slug;

    const rtRes = await app.inject({
      method: "POST",
      url: "/room-types",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Double", maxOccupancy: 2 },
    });
    expect(rtRes.statusCode).toBe(201);
    roomTypeId = JSON.parse(rtRes.body).id;

    // A single physical room of that type.
    const roomRes = await app.inject({
      method: "POST",
      url: "/rooms",
      headers: { authorization: `Bearer ${token}` },
      payload: { roomTypeId, roomNumber: "301" },
    });
    expect(roomRes.statusCode).toBe(201);

    // bookable_online defaults to true when omitted.
    const rpRes = await app.inject({
      method: "POST",
      url: "/rate-plans",
      headers: { authorization: `Bearer ${token}` },
      payload: { roomTypeId, name: "Web Rate", baseRateCents: 12000 },
    });
    expect(rpRes.statusCode).toBe(201);
    ratePlanId = JSON.parse(rpRes.body).id;
  });

  it("returns 404 for an unknown hotel slug", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/public/no-such-hotel/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=2`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("lists availability for a hotel (proves RLS context is applied)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/public/${hotelSlug}/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=2`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Without tenant context RLS would return an empty array here.
    expect(body).toHaveLength(1);
    expect(body[0].roomType.id).toBe(roomTypeId);
    expect(body[0].availableCount).toBe(1);
    expect(body[0].ratePlans).toHaveLength(1);
    expect(body[0].ratePlans[0].id).toBe(ratePlanId);
  });

  it("excludes room types that cannot fit the requested occupancy", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/public/${hotelSlug}/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=5`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveLength(0);
  });

  it("creates a booking through the public endpoint", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/public/${hotelSlug}/bookings`,
      payload: {
        guest: {
          firstName: "Ana",
          lastName: "Perez",
          email: "ana@example.com",
        },
        rooms: [{ roomTypeId, ratePlanId }],
        checkIn,
        checkOut,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.reservationId).toBeDefined();
    expect(body.totalAmountCents).toBe(12000);
    expect(body.rooms).toHaveLength(1);
    expect(body.rooms[0].status).toBe("confirmed");
  });

  it("shows the public booking to authenticated staff with source direct_booking", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/reservations",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const match = body.find((r: any) => r.source === "direct_booking");
    expect(match).toBeDefined();
    expect(match.guest_first_name).toBe("Ana");
  });

  it("reports zero availability once the only room is booked", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/public/${hotelSlug}/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=2`,
    });
    expect(res.statusCode).toBe(200);
    // The single room is now occupied for these dates, so nothing is bookable.
    expect(JSON.parse(res.body)).toHaveLength(0);
  });

  it("rejects a second overlapping public booking with 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/public/${hotelSlug}/bookings`,
      payload: {
        guest: {
          firstName: "Beto",
          lastName: "Gomez",
          email: "beto@example.com",
        },
        rooms: [{ roomTypeId, ratePlanId }],
        checkIn,
        checkOut,
      },
    });
    expect(res.statusCode).toBe(409);
  });
});
