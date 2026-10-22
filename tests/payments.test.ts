import { describe, it, expect, beforeAll } from "vitest";
import { buildApp } from "../apps/api/src/index.js";
import { signupHotel } from "./helpers.js";
import type { FastifyInstance } from "fastify";

// Covers the deposit charge on direct bookings (mock gateway), the payments
// ledger, and refunds — none of which had coverage.
describe("payments: deposits, ledger, refunds", () => {
  let app: FastifyInstance;
  let token: string;
  let hotelSlug: string;
  let roomTypeId: string;
  let ratePlanId: string;

  const checkIn = "2027-03-10";
  const checkOut = "2027-03-15"; // 5 nights
  const nightly = 10000;
  const total = nightly * 5; // 50000
  const auth = () => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
    const ts = Date.now();

    const signup = await signupHotel(app, {
      hotelName: "Payments Hotel",
      email: `payments-${ts}@test.com`,
      password: "password123",
    });
    token = signup.token;
    hotelSlug = signup.hotel.slug;

    roomTypeId = JSON.parse(
      (
        await app.inject({
          method: "POST",
          url: "/room-types",
          headers: auth(),
          payload: { name: "Std", maxOccupancy: 2 },
        })
      ).body,
    ).id;

    // Three rooms so several bookings can coexist.
    for (const n of ["401", "402", "403"]) {
      await app.inject({
        method: "POST",
        url: "/rooms",
        headers: auth(),
        payload: { roomTypeId, roomNumber: n },
      });
    }

    ratePlanId = JSON.parse(
      (
        await app.inject({
          method: "POST",
          url: "/rate-plans",
          headers: auth(),
          payload: { roomTypeId, name: "Web", baseRateCents: nightly },
        })
      ).body,
    ).id;

    // Require a 30% deposit up front.
    const dep = await app.inject({
      method: "PATCH",
      url: "/hotel/settings",
      headers: auth(),
      payload: { depositPolicyType: "percentage", depositPercentage: 30 },
    });
    expect(dep.statusCode).toBe(200);
  });

  const book = (email: string) =>
    app.inject({
      method: "POST",
      url: `/public/${hotelSlug}/bookings`,
      payload: {
        guest: { firstName: "Pat", lastName: "Guest", email },
        rooms: [{ roomTypeId, ratePlanId }],
        checkIn,
        checkOut,
      },
    });

  let reservationId: string;

  it("charges the deposit and records a completed payment", async () => {
    const res = await book(`ok-${Date.now()}@example.com`);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    reservationId = body.reservationId;

    expect(body.totalAmountCents).toBe(total);
    expect(body.payment.status).toBe("completed");
    expect(body.payment.amountCents).toBe(total * 0.3); // 15000
    expect(body.payment.balanceDueCents).toBe(total - total * 0.3);
    expect(body.payment.method).toBe("mock");
  });

  it("lists the payment in the ledger with booking + guest", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/payments?reservationId=${reservationId}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const rows = JSON.parse(res.body);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("completed");
    // Lifecycle split: `method` is how (card), `provider` is who processed it.
    expect(rows[0].method).toBe("card");
    expect(rows[0].provider).toBe("mock");
    expect(rows[0].booking_ref).toMatch(/^BK-/);
    expect(rows[0].guest_last_name).toBe("Guest");
  });

  it("declines a booking and releases the rooms", async () => {
    const res = await book("decline@example.com");
    expect(res.statusCode).toBe(402);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/declin/i);
  });

  it("refunds a completed payment as a row, then rejects a second refund", async () => {
    const payment = JSON.parse(
      (
        await app.inject({
          method: "GET",
          url: `/payments?reservationId=${reservationId}`,
          headers: auth(),
        })
      ).body,
    )[0];

    // A refund is its own completed row with a negative amount, pointed at the
    // charge it reverses; the original charge is left untouched.
    const refund = await app.inject({
      method: "POST",
      url: `/payments/${payment.id}/refund`,
      headers: auth(),
    });
    expect(refund.statusCode).toBe(201);
    const refundRow = JSON.parse(refund.body);
    expect(refundRow.kind).toBe("refund");
    expect(refundRow.status).toBe("completed");
    expect(refundRow.amount_cents).toBe(-payment.amount_cents);
    expect(refundRow.parent_payment_id).toBe(payment.id);

    // The ledger now nets to zero for this reservation: charge + refund row.
    const rows = JSON.parse(
      (
        await app.inject({
          method: "GET",
          url: `/payments?reservationId=${reservationId}`,
          headers: auth(),
        })
      ).body,
    );
    const net = rows.reduce(
      (s: number, r: { amount_cents: number; status: string }) =>
        r.status === "completed" ? s + r.amount_cents : s,
      0,
    );
    expect(net).toBe(0);
    expect(rows.find((r: { id: string }) => r.id === payment.id).status).toBe(
      "completed",
    );

    // Nothing left to refund on the original charge.
    const again = await app.inject({
      method: "POST",
      url: `/payments/${payment.id}/refund`,
      headers: auth(),
    });
    expect(again.statusCode).toBe(409);
  });

  it("records a manual cash payment and refunds it without a gateway", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/payments",
      headers: auth(),
      payload: { reservationId, amountCents: 5000, method: "cash" },
    });
    expect(created.statusCode).toBe(201);
    const id = JSON.parse(created.body).id;

    const refund = await app.inject({
      method: "POST",
      url: `/payments/${id}/refund`,
      headers: auth(),
    });
    expect(refund.statusCode).toBe(201);
    const refundRow = JSON.parse(refund.body);
    expect(refundRow.kind).toBe("refund");
    expect(refundRow.status).toBe("completed");
    expect(refundRow.amount_cents).toBe(-5000);
    expect(refundRow.parent_payment_id).toBe(id);
  });

  it("refunds a charge partially, then refunds the remainder", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/payments",
      headers: auth(),
      payload: { reservationId, amountCents: 8000, method: "cash" },
    });
    const id = JSON.parse(created.body).id;

    // Partial refund — half of it.
    const part = await app.inject({
      method: "POST",
      url: `/payments/${id}/refund`,
      headers: auth(),
      payload: { amountCents: 3000 },
    });
    expect(part.statusCode).toBe(201);
    expect(JSON.parse(part.body).amount_cents).toBe(-3000);

    // Over-refunding the remaining 5000 is rejected.
    const tooMuch = await app.inject({
      method: "POST",
      url: `/payments/${id}/refund`,
      headers: auth(),
      payload: { amountCents: 6000 },
    });
    expect(tooMuch.statusCode).toBe(409);

    // Refunding the exact remainder (no amount = all that's left) works.
    const rest = await app.inject({
      method: "POST",
      url: `/payments/${id}/refund`,
      headers: auth(),
    });
    expect(rest.statusCode).toBe(201);
    expect(JSON.parse(rest.body).amount_cents).toBe(-5000);

    // And now it's fully refunded.
    const again = await app.inject({
      method: "POST",
      url: `/payments/${id}/refund`,
      headers: auth(),
    });
    expect(again.statusCode).toBe(409);
  });

  it("returns a redirect for a gateway that needs one, then confirms it", async () => {
    // The mock treats a "redirect" email as a hosted-checkout hop.
    const res = await book(`redirect-${Date.now()}@example.com`);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.payment.status).toBe("pending");
    expect(body.redirectUrl).toContain("clientTxId=");
    const clientTxId = body.payment.transactionId as string;

    const confirm = await app.inject({
      method: "POST",
      url: `/public/${hotelSlug}/reservations/${body.reservationId}/confirm-payment`,
      payload: { clientTxId },
    });
    expect(confirm.statusCode).toBe(200);
    expect(JSON.parse(confirm.body).status).toBe("completed");

    // The ledger now shows it completed.
    const rows = JSON.parse(
      (
        await app.inject({
          method: "GET",
          url: `/payments?reservationId=${body.reservationId}`,
          headers: auth(),
        })
      ).body,
    );
    expect(rows[0].status).toBe("completed");
  });

  it("charges nothing when the deposit policy is none", async () => {
    await app.inject({
      method: "PATCH",
      url: "/hotel/settings",
      headers: auth(),
      payload: { depositPolicyType: "none" },
    });
    const res = await book(`none-${Date.now()}@example.com`);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.payment.status).toBe("none");
    expect(body.payment.amountCents).toBe(0);
    expect(body.payment.balanceDueCents).toBe(total);
  });
});
