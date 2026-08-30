import { describe, it, expect, beforeAll } from "vitest";
import { buildApp } from "../apps/api/src/index.js";
import type { FastifyInstance } from "fastify";

describe("entity CRUD", () => {
  let app: FastifyInstance;
  let token: string;
  let hotelId: string;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
    const ts = Date.now();
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        hotelName: "CRUD Test Hotel",
        hotelSlug: `crud-test-${ts}`,
        email: `crud-${ts}@test.com`,
        password: "password123",
      },
    });
    const body = JSON.parse(res.body);
    token = body.token;
    hotelId = body.hotel.id;
  });

  function authHeaders() {
    return { authorization: `Bearer ${token}` };
  }

  // ── Room Types ──────────────────────────────────────────────────────

  describe("room types", () => {
    let roomTypeId: string;

    it("creates a room type", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/room-types",
        headers: authHeaders(),
        payload: { name: "Deluxe Suite", maxOccupancy: 3 },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.name).toBe("Deluxe Suite");
      expect(body.max_occupancy).toBe(3);
      roomTypeId = body.id;
    });

    it("lists room types and the created one appears", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/room-types",
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(200);
      const list = JSON.parse(res.body);
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.some((rt: any) => rt.id === roomTypeId)).toBe(true);
    });
  });

  // ── Rooms ───────────────────────────────────────────────────────────

  describe("rooms", () => {
    let roomTypeId: string;
    let roomId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: "POST",
        url: "/room-types",
        headers: authHeaders(),
        payload: { name: "Room Test Type", maxOccupancy: 2 },
      });
      roomTypeId = JSON.parse(res.body).id;
    });

    it("creates a room and returns housekeeping_status", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/rooms",
        headers: authHeaders(),
        payload: {
          roomTypeId,
          roomNumber: "101",
          floor: 1,
          status: "available",
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.room_number).toBe("101");
      expect(body.floor).toBe(1);
      expect(body.housekeeping_status).toBeDefined();
      roomId = body.id;
    });

    it("lists rooms and the created one appears with room_type_name and housekeeping_status", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/rooms",
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(200);
      const list = JSON.parse(res.body);
      const room = list.find((r: any) => r.id === roomId);
      expect(room).toBeDefined();
      expect(room.room_type_name).toBe("Room Test Type");
      expect(room.housekeeping_status).toBeDefined();
    });

    it("gets a room by ID", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/rooms/${roomId}`,
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(roomId);
      expect(body.room_number).toBe("101");
      expect(body.housekeeping_status).toBeDefined();
    });

    it("patches a room (update status to maintenance)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/rooms/${roomId}`,
        headers: authHeaders(),
        payload: { status: "maintenance" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("maintenance");
    });

    it("deletes a room", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/rooms/${roomId}`,
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(204);
    });

    it("returns 404 for a deleted room", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/rooms/${roomId}`,
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Rate Plans ──────────────────────────────────────────────────────

  describe("rate plans", () => {
    let roomTypeId: string;
    let ratePlanId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: "POST",
        url: "/room-types",
        headers: authHeaders(),
        payload: { name: "Rate Plan Test Type", maxOccupancy: 2 },
      });
      roomTypeId = JSON.parse(res.body).id;
    });

    it("creates a rate plan with new fields", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/rate-plans",
        headers: authHeaders(),
        payload: {
          roomTypeId,
          name: "Standard Rate",
          baseRateCents: 15000,
          currency: "USD",
          cancellationPolicy: "Free cancellation up to 24h before check-in",
          minStay: 1,
          maxStay: 14,
          bookableOnline: true,
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.name).toBe("Standard Rate");
      expect(body.base_rate_cents).toBe(15000);
      expect(body.currency).toBe("USD");
      expect(body.cancellation_policy).toBe(
        "Free cancellation up to 24h before check-in",
      );
      expect(body.min_stay).toBe(1);
      expect(body.max_stay).toBe(14);
      expect(body.bookable_online).toBe(true);
      ratePlanId = body.id;
    });

    it("lists rate plans and the created one appears", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/rate-plans",
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(200);
      const list = JSON.parse(res.body);
      expect(list.some((rp: any) => rp.id === ratePlanId)).toBe(true);
    });

    it("lists rate plans filtered by roomTypeId", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/rate-plans?roomTypeId=${roomTypeId}`,
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(200);
      const list = JSON.parse(res.body);
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.every((rp: any) => rp.room_type_id === roomTypeId)).toBe(
        true,
      );
    });

    it("gets a rate plan by ID", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/rate-plans/${ratePlanId}`,
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(ratePlanId);
      expect(body.name).toBe("Standard Rate");
      expect(body.cancellation_policy).toBeDefined();
      expect(body.bookable_online).toBeDefined();
    });

    it("updates a rate plan (PUT) with new fields", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `/rate-plans/${ratePlanId}`,
        headers: authHeaders(),
        payload: {
          roomTypeId,
          name: "Premium Rate",
          baseRateCents: 25000,
          currency: "EUR",
          cancellationPolicy: "Non-refundable",
          minStay: 2,
          maxStay: 7,
          bookableOnline: false,
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.name).toBe("Premium Rate");
      expect(body.base_rate_cents).toBe(25000);
      expect(body.currency).toBe("EUR");
      expect(body.cancellation_policy).toBe("Non-refundable");
      expect(body.min_stay).toBe(2);
      expect(body.max_stay).toBe(7);
      expect(body.bookable_online).toBe(false);
    });

    it("deletes a rate plan", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/rate-plans/${ratePlanId}`,
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(204);
    });
  });

  // ── Guests ──────────────────────────────────────────────────────────

  describe("guests", () => {
    let guestId: string;

    it("creates a guest", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/guests",
        headers: authHeaders(),
        payload: {
          firstName: "Jane",
          lastName: "Doe",
          email: "jane.doe@example.com",
          phone: "+1234567890",
          documentType: "passport",
          documentNumber: "AB123456",
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.first_name).toBe("Jane");
      expect(body.last_name).toBe("Doe");
      expect(body.email).toBe("jane.doe@example.com");
      guestId = body.id;
    });

    it("lists guests ordered by last_name", async () => {
      // Create a second guest with a last name that sorts before "Doe"
      await app.inject({
        method: "POST",
        url: "/guests",
        headers: authHeaders(),
        payload: { firstName: "Alice", lastName: "Adams" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/guests",
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(200);
      const list = JSON.parse(res.body);
      expect(list.length).toBeGreaterThanOrEqual(2);
      // Adams should come before Doe
      const lastNames = list.map((g: any) => g.last_name);
      expect(lastNames.indexOf("Adams")).toBeLessThan(
        lastNames.indexOf("Doe"),
      );
    });

    it("gets a guest by ID", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/guests/${guestId}`,
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(guestId);
      expect(body.first_name).toBe("Jane");
    });

    it("updates a guest (PUT)", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `/guests/${guestId}`,
        headers: authHeaders(),
        payload: {
          firstName: "Janet",
          lastName: "Doe-Smith",
          email: "janet.smith@example.com",
          phone: "+0987654321",
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.first_name).toBe("Janet");
      expect(body.last_name).toBe("Doe-Smith");
      expect(body.email).toBe("janet.smith@example.com");
      expect(body.phone).toBe("+0987654321");
    });

    it("deletes a guest", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/guests/${guestId}`,
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(204);
    });
  });

  // ── Hotel Settings ──────────────────────────────────────────────────

  describe("hotel settings", () => {
    it("gets hotel settings with default values", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/hotel/settings",
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("deposit_policy_type");
      expect(body).toHaveProperty("deposit_percentage");
      expect(body).toHaveProperty("tax_rate");
      expect(body).toHaveProperty("tourism_tax_rate");
      expect(body).toHaveProperty("currency");
    });

    it("updates hotel settings", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/hotel/settings",
        headers: authHeaders(),
        payload: {
          depositPolicyType: "percentage",
          depositPercentage: 30,
          taxRate: 21,
          tourismTaxRate: 2,
          currency: "EUR",
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.deposit_policy_type).toBe("percentage");
      expect(body.deposit_percentage).toBe(30);
      expect(body.tax_rate).toBe(21);
      expect(body.tourism_tax_rate).toBe(2);
      expect(body.currency).toBe("EUR");
    });

    it("persists settings after update", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/hotel/settings",
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.deposit_policy_type).toBe("percentage");
      expect(body.currency).toBe("EUR");
    });
  });

  // ── Housekeeping ────────────────────────────────────────────────────

  describe("housekeeping", () => {
    let roomTypeId: string;
    let roomId: string;
    let taskId: string;

    beforeAll(async () => {
      const rtRes = await app.inject({
        method: "POST",
        url: "/room-types",
        headers: authHeaders(),
        payload: { name: "Housekeeping Test Type", maxOccupancy: 2 },
      });
      roomTypeId = JSON.parse(rtRes.body).id;

      const rRes = await app.inject({
        method: "POST",
        url: "/rooms",
        headers: authHeaders(),
        payload: { roomTypeId, roomNumber: "HK-01", floor: 1 },
      });
      roomId = JSON.parse(rRes.body).id;
    });

    it("lists rooms on the housekeeping dashboard", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/housekeeping",
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(200);
      const list = JSON.parse(res.body);
      const room = list.find((r: any) => r.id === roomId);
      expect(room).toBeDefined();
      expect(room.housekeeping_status).toBeDefined();
      expect(room.room_type_name).toBe("Housekeeping Test Type");
    });

    it("creates a housekeeping task and sets room to in_progress", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/housekeeping/tasks",
        headers: authHeaders(),
        payload: {
          roomId,
          taskType: "checkout_clean",
          notes: "Deep clean requested by guest",
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.room_id).toBe(roomId);
      expect(body.task_type).toBe("checkout_clean");
      expect(body.status).toBe("pending");
      expect(body.notes).toBe("Deep clean requested by guest");
      taskId = body.id;

      // Room should now be in_progress
      const roomRes = await app.inject({
        method: "GET",
        url: `/rooms/${roomId}`,
        headers: authHeaders(),
      });
      const room = JSON.parse(roomRes.body);
      expect(room.housekeeping_status).toBe("in_progress");
    });

    it("lists housekeeping tasks", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/housekeeping/tasks",
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(200);
      const list = JSON.parse(res.body);
      const task = list.find((t: any) => t.id === taskId);
      expect(task).toBeDefined();
      expect(task.room_number).toBe("HK-01");
    });

    it("completes a housekeeping task and sets room to clean", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/housekeeping/tasks/${taskId}`,
        headers: authHeaders(),
        payload: { status: "completed" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("completed");
      expect(body.completed_at).toBeDefined();

      // Room should now be clean
      const roomRes = await app.inject({
        method: "GET",
        url: `/rooms/${roomId}`,
        headers: authHeaders(),
      });
      const room = JSON.parse(roomRes.body);
      expect(room.housekeeping_status).toBe("clean");
    });

    it("filters housekeeping dashboard by status", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/housekeeping?status=clean",
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(200);
      const list = JSON.parse(res.body);
      const room = list.find((r: any) => r.id === roomId);
      expect(room).toBeDefined();
    });

    it("updates room housekeeping status directly", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/rooms/${roomId}/housekeeping`,
        headers: authHeaders(),
        payload: { status: "dirty" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.housekeeping_status).toBe("dirty");
    });
  });
});
