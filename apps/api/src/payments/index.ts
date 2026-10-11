import { MockPaymentAdapter } from "./mockAdapter.js";
import { PayPhonePaymentAdapter } from "./payphoneAdapter.js";
import type { PaymentAdapter } from "./types.js";

export * from "./types.js";

let adapter: PaymentAdapter | null = null;

// Resolve the active gateway from PAYMENT_PROVIDER. "payphone" needs
// PAYPHONE_TOKEN + PAYPHONE_STORE_ID; if those are missing it falls back to the
// mock with a loud warning so dev keeps working and misconfiguration is obvious.
export function getPaymentAdapter(): PaymentAdapter {
  if (adapter) return adapter;
  const provider = process.env.PAYMENT_PROVIDER ?? "mock";

  if (provider === "payphone") {
    const token = process.env.PAYPHONE_TOKEN;
    const storeId = process.env.PAYPHONE_STORE_ID;
    if (token && storeId) {
      adapter = new PayPhonePaymentAdapter(token, storeId);
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        "[payments] PAYMENT_PROVIDER=payphone but PAYPHONE_TOKEN/STORE_ID are unset — falling back to the mock gateway.",
      );
      adapter = new MockPaymentAdapter();
    }
  } else {
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
