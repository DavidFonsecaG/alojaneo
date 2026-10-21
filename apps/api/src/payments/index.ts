import { MockPaymentAdapter } from "./mockAdapter.js";
import { PayPhonePaymentAdapter } from "./payphoneAdapter.js";
import { KushkiPaymentAdapter } from "./kushkiAdapter.js";
import { getHotelPaymentConfig } from "./config.js";
import type { PaymentAdapter } from "./types.js";

export * from "./types.js";
export {
  getHotelPaymentConfig,
  saveHotelPaymentConfig,
  type HotelPaymentConfig,
  type SavePaymentConfigInput,
} from "./config.js";

const mock = new MockPaymentAdapter();

// Per-hotel adapter cache. The signature includes the provider + key presence so
// a settings change takes effect without a server restart.
const cache = new Map<string, { sig: string; adapter: PaymentAdapter }>();

// Resolve the active gateway for a hotel from its stored config. A hotel that
// hasn't enabled + configured a gateway (or whose key can't be decrypted) gets
// the mock, so dev and unconfigured tenants keep working.
export async function getPaymentAdapter(
  hotelId: string,
): Promise<PaymentAdapter> {
  const cfg = await getHotelPaymentConfig(hotelId);
  const active = cfg?.enabled && cfg.privateKey ? cfg.provider : "mock";
  const sig = `${active}|${cfg?.publicKey ?? ""}|${cfg?.privateKey ? "k" : ""}`;

  const hit = cache.get(hotelId);
  if (hit && hit.sig === sig) return hit.adapter;

  let adapter: PaymentAdapter;
  if (active === "payphone" && cfg?.privateKey) {
    // PayPhone's Bearer token + storeId map onto our private/public key fields.
    adapter = new PayPhonePaymentAdapter(cfg.privateKey, cfg.publicKey ?? "");
  } else if (active === "kushki" && cfg?.privateKey) {
    adapter = new KushkiPaymentAdapter(cfg.privateKey, cfg.publicKey ?? "");
  } else {
    adapter = mock;
  }

  cache.set(hotelId, { sig, adapter });
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
