import { describe, it, expect, beforeAll } from "vitest";
import { buildApp } from "../apps/api/src/index.js";
import type { FastifyInstance } from "fastify";

describe("reservation lifecycle through the real API", () => {
  let app: FastifyInstance;
  let token: string;
  let roomTypeId: string;
  let room1Id: string;
  let room2Id: string;
  let ratePlanId: string;
  let guestId: string;
  let reservationId: string;
  let reservationRoom1Id: string;
  let reservationRoom2Id: string;
  let paymentId: string;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
    const ts = Date.now();

    // signup
    const signupRes = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        hotelName: "Reservation Test Hotel",
        hotelSlug: `res-test-${ts}`,
        email: `res-${ts}@test.com`,
        password: "password123",
      },
    });
    expect(signupRes.statusCode).toBe(201);
    token = JSON.parse(signupRes.body).token;

    // create room type
    const rtRes = await app.inject({
      method: "POST",
      url: "/room-types",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Deluxe", maxOccupancy: 3 },
    });
    expect(rtRes.statusCode).toBe(201);
    roomTypeId = JSON.parse(rtRes.body).id;

    // create rooms
    const r1 = await app.inject({
      method: "POST",
      url: "/rooms",
      headers: { authorization: `Bearer ${token}` },
      payload: { roomTypeId, roomNumber: "101" },
    });
    expect(r1.statusCode).toBe(201);
    room1Id = JSON.parse(r1.body).id;

    const r2 = await app.inject({
      method: "POST",
      url: "/rooms",
      headers: { authorization: `Bearer ${token}` },
      payload: { roomTypeId, roomNumber: "102" },
    });
    expect(r2.statusCode).toBe(201);
    room2Id = JSON.parse(r2.body).id;

    // create rate plan
    const rpRes = await app.inject({
      method: "POST",
      url: "/rate-plans",
      headers: { authorization: `Bearer ${token}` },
      payload: { roomTypeId, name: "Standard Rate", baseRateCents: 15000 },
    });
    expect(rpRes.statusCode).toBe(201);
    ratePlanId = JSON.parse(rpRes.body).id;

    // create guest
    const gRes = await app.inject({
      method: "POST",
      url: "/guests",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        firstName: "John",
        lastName: "Doe",
        email: "john@test.com",
      },
    });
    expect(gRes.statusCode).toBe(201);
    guestId = JSON.parse(gRes.body).id;
  });

  it("creates a reservation with two rooms using per-room check_in/check_out", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/reservations",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        guestId,
        rooms: [
          {
            roomId: room1Id,
            ratePlanId,
            rateCents: 15000,
            checkIn: "2026-08-01",
            checkOut: "2026-08-05",
          },
          {
            roomId: room2Id,
            ratePlanId,
            rateCents: 15000,
            checkIn: "2026-08-01",
            checkOut: "2026-08-05",
          },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.total_amount_cents).toBe(30000);
    expect(body.rooms).toHaveLength(2);
    expect(body.rooms[0].status).toBe("confirmed");
    expect(body.rooms[0].check_in).toBeDefined();
    expect(body.rooms[0].check_out).toBeDefined();
    expect(body.rooms[1].status).toBe("confirmed");
    reservationId = body.id;
    reservationRoom1Id = body.rooms[0].id;
    reservationRoom2Id = body.rooms[1].id;
  });

  it("rejects a reservation where checkOut is before checkIn (per-room validation)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/reservations",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        guestId,
        rooms: [
          {
            roomId: room1Id,
            ratePlanId,
            rateCents: 15000,
            checkIn: "2026-08-05",
            checkOut: "2026-08-01",
          },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("lists reservations and includes the created one", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/reservations",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const match = body.find((r: any) => r.id === reservationId);
    expect(match).toBeDefined();
    expect(match.guest_first_name).toBe("John");
  });

  it("filters reservations by status", async () => {
    const confirmed = await app.inject({
      method: "GET",
      url: "/reservations?status=confirmed",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(confirmed.statusCode).toBe(200);
    const confirmedBody = JSON.parse(confirmed.body);
    const match = confirmedBody.find((r: any) => r.id === reservationId);
    expect(match).toBeDefined();

    const cancelled = await app.inject({
      method: "GET",
      url: "/reservations?status=cancelled",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(cancelled.statusCode).toBe(200);
    const cancelledBody = JSON.parse(cancelled.body);
    expect(cancelledBody).toHaveLength(0);
  });

  it("gets a reservation by ID with embedded rooms and notes", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/reservations/${reservationId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(reservationId);
    expect(body.rooms).toHaveLength(2);
    expect(body.rooms[0].room_number).toBeDefined();
    expect(body.rooms[0].check_in).toBeDefined();
    expect(body.rooms[0].check_out).toBeDefined();
    expect(body.rooms[0].status).toBe("confirmed");
    expect(body.rooms[1].room_number).toBeDefined();
    expect(body.notes).toBeDefined();
    expect(Array.isArray(body.notes)).toBe(true);
  });

  it("adds a note to a reservation", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/reservations/${reservationId}/notes`,
      headers: { authorization: `Bearer ${token}` },
      payload: { body: "Guest requested late check-out" },
    });
    expect(res.statusCode).toBe(201);
    const note = JSON.parse(res.body);
    expect(note.reservation_id).toBe(reservationId);
    expect(note.body).toBe("Guest requested late check-out");
    expect(note.user_id).toBeDefined();
  });

  it("shows notes when fetching the reservation", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/reservations/${reservationId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.notes).toHaveLength(1);
    expect(body.notes[0].body).toBe("Guest requested late check-out");
    expect(body.notes[0].user_email).toBeDefined();
  });

  it("checks in a reservation room via PATCH /reservation-rooms/:id/status", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/reservation-rooms/${reservationRoom1Id}/status`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "checked_in" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("checked_in");
    expect(body.id).toBe(reservationRoom1Id);
  });

  it("checks out a reservation room and auto-sets room housekeeping_status to dirty", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/reservation-rooms/${reservationRoom1Id}/status`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "checked_out" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("checked_out");

    // Verify the physical room's housekeeping_status is now dirty
    const roomRes = await app.inject({
      method: "GET",
      url: `/rooms/${room1Id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(roomRes.statusCode).toBe(200);
    const room = JSON.parse(roomRes.body);
    expect(room.housekeeping_status).toBe("dirty");
  });

  it("checks in and out the second room independently", async () => {
    // Check in room 2
    const checkinRes = await app.inject({
      method: "PATCH",
      url: `/reservation-rooms/${reservationRoom2Id}/status`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "checked_in" },
    });
    expect(checkinRes.statusCode).toBe(200);
    expect(JSON.parse(checkinRes.body).status).toBe("checked_in");

    // Check out room 2
    const checkoutRes = await app.inject({
      method: "PATCH",
      url: `/reservation-rooms/${reservationRoom2Id}/status`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "checked_out" },
    });
    expect(checkoutRes.statusCode).toBe(200);
    expect(JSON.parse(checkoutRes.body).status).toBe("checked_out");

    // Verify room 2 housekeeping is dirty too
    const roomRes = await app.inject({
      method: "GET",
      url: `/rooms/${room2Id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(JSON.parse(roomRes.body).housekeeping_status).toBe("dirty");
  });

  it("creates a payment for the reservation", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/payments",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        reservationId,
        amountCents: 30000,
        method: "credit_card",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("completed");
    paymentId = body.id;
  });

  it("lists payments for the reservation", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/payments?reservationId=${reservationId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const match = body.find((p: any) => p.id === paymentId);
    expect(match).toBeDefined();
  });

  it("refunds a payment", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/payments/${paymentId}/status`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "refunded" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("refunded");
  });

  it("enforces tenant isolation on reservations", async () => {
    const ts = Date.now();
    const signupRes = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        hotelName: "Other Hotel",
        hotelSlug: `other-hotel-${ts}`,
        email: `other-${ts}@test.com`,
        password: "password123",
      },
    });
    expect(signupRes.statusCode).toBe(201);
    const otherToken = JSON.parse(signupRes.body).token;

    const res = await app.inject({
      method: "GET",
      url: "/reservations",
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(0);
  });
});

describe("double-booking prevention", () => {
  let app: FastifyInstance;
  let token: string;
  let roomTypeId: string;
  let roomId: string;
  let ratePlanId: string;
  let guestId: string;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
    const ts = Date.now();

    const signupRes = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        hotelName: "Overlap Test Hotel",
        hotelSlug: `overlap-test-${ts}`,
        email: `overlap-${ts}@test.com`,
        password: "password123",
      },
    });
    expect(signupRes.statusCode).toBe(201);
    token = JSON.parse(signupRes.body).token;

    const rtRes = await app.inject({
      method: "POST",
      url: "/room-types",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Standard", maxOccupancy: 2 },
    });
    roomTypeId = JSON.parse(rtRes.body).id;

    const roomRes = await app.inject({
      method: "POST",
      url: "/rooms",
      headers: { authorization: `Bearer ${token}` },
      payload: { roomTypeId, roomNumber: "201" },
    });
    roomId = JSON.parse(roomRes.body).id;

    const rpRes = await app.inject({
      method: "POST",
      url: "/rate-plans",
      headers: { authorization: `Bearer ${token}` },
      payload: { roomTypeId, name: "Standard Rate", baseRateCents: 10000 },
    });
    ratePlanId = JSON.parse(rpRes.body).id;

    const gRes = await app.inject({
      method: "POST",
      url: "/guests",
      headers: { authorization: `Bearer ${token}` },
      payload: { firstName: "Jane", lastName: "Roe", email: "jane@test.com" },
    });
    guestId = JSON.parse(gRes.body).id;
  });

  const book = (checkIn: string, checkOut: string) =>
    app.inject({
      method: "POST",
      url: "/reservations",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        guestId,
        rooms: [{ roomId, ratePlanId, rateCents: 10000, checkIn, checkOut }],
      },
    });

  it("accepts the first booking for a room", async () => {
    const res = await book("2026-09-01", "2026-09-05");
    expect(res.statusCode).toBe(201);
  });

  it("rejects an overlapping booking for the same room with 409", async () => {
    const res = await book("2026-09-03", "2026-09-07");
    expect(res.statusCode).toBe(409);
  });

  it("allows a back-to-back booking starting on the previous checkout day", async () => {
    // Half-open dates: checkout 09-05 does not overlap a 09-05 check-in.
    const res = await book("2026-09-05", "2026-09-08");
    expect(res.statusCode).toBe(201);
  });

  it("rejects two overlapping stays of the same room in one reservation payload", async () => {
    // Neither row exists yet, so the app-level pre-check passes for both;
    // the exclusion constraint rejects the second insert atomically.
    const res = await app.inject({
      method: "POST",
      url: "/reservations",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        guestId,
        rooms: [
          {
            roomId,
            ratePlanId,
            rateCents: 10000,
            checkIn: "2026-10-01",
            checkOut: "2026-10-03",
          },
          {
            roomId,
            ratePlanId,
            rateCents: 10000,
            checkIn: "2026-10-02",
            checkOut: "2026-10-04",
          },
        ],
      },
    });
    expect(res.statusCode).toBe(409);

    // And the failed reservation was rolled back — the dates are still free.
    const retry = await book("2026-10-01", "2026-10-04");
    expect(retry.statusCode).toBe(201);
  });

  it("frees the room for rebooking once the conflicting stay is cancelled", async () => {
    const first = await book("2026-12-01", "2026-12-03");
    expect(first.statusCode).toBe(201);
    const reservationRoomId = JSON.parse(first.body).rooms[0].id;

    // Same dates are blocked while the stay is active...
    const blocked = await book("2026-12-01", "2026-12-03");
    expect(blocked.statusCode).toBe(409);

    // ...but cancelling releases the room from the exclusion constraint.
    const cancel = await app.inject({
      method: "PATCH",
      url: `/reservation-rooms/${reservationRoomId}/status`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "cancelled" },
    });
    expect(cancel.statusCode).toBe(200);

    const rebook = await book("2026-12-01", "2026-12-03");
    expect(rebook.statusCode).toBe(201);
  });
});
