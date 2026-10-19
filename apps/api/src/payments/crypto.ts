import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

// AES-256-GCM encryption for secrets at rest — currently each hotel's gateway
// private key. The master key comes from PAYMENTS_ENC_KEY (any sufficiently long
// string; it's hashed to 32 bytes). In production it is required; in dev we fall
// back to a fixed throwaway key with a warning so the app still runs, but real
// gateway keys must never be stored under the dev key.

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // GCM standard
const TAG_LEN = 16;

let keyCache: Buffer | null = null;

function masterKey(): Buffer {
  if (keyCache) return keyCache;
  const raw = process.env.PAYMENTS_ENC_KEY;
  if (raw && raw.length >= 16) {
    keyCache = createHash("sha256").update(raw).digest();
  } else {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "PAYMENTS_ENC_KEY must be set (16+ chars) to store gateway keys in production",
      );
    }
    // eslint-disable-next-line no-console
    console.warn(
      "[payments] PAYMENTS_ENC_KEY is unset — using an insecure dev key. " +
        "Set it before storing real gateway credentials.",
    );
    keyCache = createHash("sha256")
      .update("alojaneo-dev-payments-key")
      .digest();
  }
  return keyCache;
}

// Returns base64( iv[12] | authTag[16] | ciphertext ).
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptSecret(enc: string): string {
  const buf = Buffer.from(enc, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
