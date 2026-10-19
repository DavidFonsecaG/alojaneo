import { randomBytes } from "node:crypto";
import { sqlUnscoped } from "../db.js";
import { decryptSecret, encryptSecret } from "./crypto.js";

// Per-hotel gateway configuration lives on the `hotels` row (non-RLS), like the
// other hotel settings. The private key is stored encrypted; this module is the
// only place that decrypts it.

export interface HotelPaymentConfig {
  provider: string; // kushki | payphone | mock
  publicKey: string | null; // publishable (booking engine)
  privateKey: string | null; // decrypted secret, or null if unset/undecryptable
  enabled: boolean;
  webhookToken: string | null;
}

export async function getHotelPaymentConfig(
  hotelId: string,
): Promise<HotelPaymentConfig | null> {
  const [row] = await sqlUnscoped`
    select payment_provider, payment_public_key, payment_private_key_enc,
           payment_enabled, payment_webhook_token
    from hotels
    where id = ${hotelId}
  `;
  if (!row) return null;

  let privateKey: string | null = null;
  if (row.payment_private_key_enc) {
    try {
      privateKey = decryptSecret(row.payment_private_key_enc);
    } catch {
      // A key encrypted under a different master key (e.g. rotated/mismatched)
      // decrypts to nothing rather than throwing into the request.
      privateKey = null;
    }
  }

  return {
    provider: row.payment_provider ?? "mock",
    publicKey: row.payment_public_key ?? null,
    privateKey,
    enabled: row.payment_enabled ?? false,
    webhookToken: row.payment_webhook_token ?? null,
  };
}

export interface SavePaymentConfigInput {
  provider?: string;
  publicKey?: string | null; // null / "" clears it; undefined keeps it
  privateKey?: string; // write-only; "" clears it; undefined keeps it
  enabled?: boolean;
}

export async function saveHotelPaymentConfig(
  hotelId: string,
  input: SavePaymentConfigInput,
): Promise<void> {
  const privateKeyEnc =
    input.privateKey === undefined
      ? undefined
      : input.privateKey
        ? encryptSecret(input.privateKey)
        : null;

  // Mint a webhook token the first time payments are turned on (keep any
  // existing one via coalesce).
  const newToken =
    input.enabled === true ? randomBytes(24).toString("base64url") : null;

  await sqlUnscoped`
    update hotels set
      payment_provider = coalesce(${input.provider ?? null}, payment_provider),
      payment_public_key = ${
        input.publicKey === undefined
          ? sqlUnscoped`payment_public_key`
          : input.publicKey || null
      },
      payment_private_key_enc = ${
        privateKeyEnc === undefined
          ? sqlUnscoped`payment_private_key_enc`
          : privateKeyEnc
      },
      payment_enabled = coalesce(${input.enabled ?? null}, payment_enabled),
      payment_webhook_token = coalesce(payment_webhook_token, ${newToken})
    where id = ${hotelId}
  `;
}
