import { withTenant } from "../db.js";
import { getPaymentAdapter } from "./index.js";
import { settlePayment } from "./settle.js";

// Sweep a hotel's stuck 'pending' charges: ask the gateway for each one's real
// status and settle those that have resolved. A safety net for redirect flows
// where the guest never returned and no webhook arrived. Idempotent (settlement
// is), so it's safe to run repeatedly / on a schedule.
export async function reconcileHotelPayments(
  hotelId: string,
  olderThanMinutes = 15,
): Promise<{ checked: number; settled: number }> {
  const pending = await withTenant(
    hotelId,
    (tx) => tx`
      select client_tx_id, provider_tx_id
      from payments
      where status = 'pending' and kind = 'charge'
        and client_tx_id is not null
        and created_at < now() - make_interval(mins => ${olderThanMinutes})
      order by created_at
      limit 100
    `,
  );
  if (pending.length === 0) return { checked: 0, settled: 0 };

  const adapter = await getPaymentAdapter(hotelId);
  let settled = 0;
  for (const p of pending) {
    const result = await adapter.getStatus({
      clientTxId: p.client_tx_id as string,
      providerTxId: (p.provider_tx_id as string | null) ?? undefined,
    });
    if (result.status === "completed" || result.status === "failed") {
      const out = await settlePayment(hotelId, p.client_tx_id as string, result);
      if (out.transitioned) settled++;
    }
  }
  return { checked: pending.length, settled };
}
