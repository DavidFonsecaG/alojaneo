import { MockPaymentAdapter } from "./mockAdapter.js";
import type { PaymentAdapter } from "./types.js";

export * from "./types.js";

let adapter: PaymentAdapter | null = null;

// Resolve the active gateway. PAYMENT_PROVIDER selects it; today only "mock"
// exists — real adapters (payphone, placetopay, …) register here later.
export function getPaymentAdapter(): PaymentAdapter {
  if (adapter) return adapter;
  const provider = process.env.PAYMENT_PROVIDER ?? "mock";
  switch (provider) {
    case "mock":
    default:
      adapter = new MockPaymentAdapter();
  }
  return adapter;
}

// The amount to collect up front, from the hotel's deposit policy:
//   full        → the whole stay
//   percentage  → that % of the total
//   none/other  → nothing now (pay at the property)
export function computeDepositCents(
  policyType: string | null | undefined,
  percentage: number | null | undefined,
  totalCents: number,
): number {
  if (policyType === "full") return totalCents;
  if (policyType === "percentage" && percentage && percentage > 0) {
    return Math.min(totalCents, Math.round((totalCents * percentage) / 100));
  }
  return 0;
}
