import { withTenant } from "../db.js";
import type { ConfirmResult } from "./types.js";

// The outcome of a settlement attempt, with enough context for the caller to
// email the guest / build a response without re-querying.
export interface SettleOutcome {
  found: boolean;
  status: "completed" | "failed" | "pending" | "none";
  // The payment was already completed/failed before this call (replay).
  alreadySettled: boolean;
  // This call is the one that moved it to its final state (send the email once).
  transitioned: boolean;
  bookingRef?: string;
  reservationId?: string;
  guest?: { firstName: string; lastName: string; email: string | null };
  checkIn?: string;
  checkOut?: string;
  totalCents?: number;
  amountCents?: number;
  currency?: string;
}

// Apply a gateway confirm/webhook result to the pending charge identified by
// clientTxId. This is the ONE place a deposit transitions to completed/failed:
// it sets the status + provider_tx_id, releases the rooms on failure, and is
// idempotent — the row is locked for the transaction and an already-resolved
// payment is a no-op, so the return-URL confirm, a webhook, and reconciliation
// can all call it safely (and concurrently).
export async function settlePayment(
  hotelId: string,
  clientTxId: string,
  result: ConfirmResult,
): Promise<SettleOutcome> {
  return withTenant(hotelId, async (tx) => {
    const [pay] = await tx`
      select
        p.id, p.status, p.amount_cents, p.currency, p.reservation_id,
        r.booking_ref, r.total_amount_cents,
        g.first_name, g.last_name, g.email,
        (select to_char(min(check_in), 'YYYY-MM-DD') from reservation_rooms where reservation_id = r.id) as check_in,
        (select to_char(max(check_out), 'YYYY-MM-DD') from reservation_rooms where reservation_id = r.id) as check_out
      from payments p
      join reservations r on r.id = p.reservation_id
      join guests g on g.id = r.guest_id
      where p.client_tx_id = ${clientTxId} and p.kind = 'charge'
      for update of p
    `;

    if (!pay) {
      return { found: false, status: "none", alreadySettled: false, transitioned: false };
    }

    const base = {
      found: true as const,
      bookingRef: pay.booking_ref as string,
      reservationId: pay.reservation_id as string,
      guest: {
        firstName: pay.first_name as string,
        lastName: pay.last_name as string,
        email: (pay.email as string | null) ?? null,
      },
      checkIn: String(pay.check_in).slice(0, 10),
      checkOut: String(pay.check_out).slice(0, 10),
      totalCents: pay.total_amount_cents as number,
      amountCents: pay.amount_cents as number,
      currency: (pay.currency as string) ?? "USD",
    };

    // Already resolved → idempotent no-op (a replayed return or a late webhook).
    if (pay.status === "completed" || pay.status === "failed") {
      return { ...base, status: pay.status, alreadySettled: true, transitioned: false };
    }

    const next = result.status === "completed" ? "completed" : "failed";
    await tx`
      update payments
         set status = ${next},
             provider_tx_id = ${result.transactionId},
             updated_at = now()
       where id = ${pay.id}
    `;
    if (next === "failed") {
      // A declined deposit must not hold inventory.
      await tx`
        update reservation_rooms set status = 'cancelled'
        where reservation_id = ${pay.reservation_id}
      `;
    }

    return { ...base, status: next, alreadySettled: false, transitioned: true };
  });
}
