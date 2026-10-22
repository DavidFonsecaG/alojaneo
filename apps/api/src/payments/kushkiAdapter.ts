import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  ConfirmRequest,
  ConfirmResult,
  CreateIntentRequest,
  PaymentAdapter,
  PaymentIntent,
  RefundResult,
  WebhookEvent,
} from "./types.js";

// Kushki adapter — LatAm gateway (Ecuador/Colombia/Peru/Chile/Mexico).
//
// Embedded card flow: the booking engine tokenises the card client-side with
// Kushki.js (public merchant key) and sends us the token; here we charge it
// server-side with the private merchant key. The charge is synchronous, so
// createIntent returns "completed"/"failed" directly (no redirect). Webhooks are
// used for async events (refund approved, chargeback) and verified by HMAC.
//
// Auth: `Private-Merchant-Id: <private key>` header. Amounts are decimal major
// units (e.g. 40.00), not cents. Base: api.kushkipagos.com (prod) /
// api-uat.kushkipagos.com (test).
//
// TODO(sandbox): verify the exact charge/refund request + response fields, the
// webhook payload shape and signature headers, and the status endpoint against
// a real Kushki UAT account before taking live payments. Scaffolded from the
// public docs.
const PROD_BASE = "https://api.kushkipagos.com";
const UAT_BASE = "https://api-uat.kushkipagos.com";

// Base host: an explicit KUSHKI_BASE_URL wins; otherwise PAYMENTS_TEST picks
// UAT vs. production.
function defaultBase(): string {
  if (process.env.KUSHKI_BASE_URL) return process.env.KUSHKI_BASE_URL;
  return process.env.PAYMENTS_TEST === "true" ? UAT_BASE : PROD_BASE;
}

const major = (cents: number) => Number((cents / 100).toFixed(2));

export class KushkiPaymentAdapter implements PaymentAdapter {
  readonly name = "kushki";

  constructor(
    private privateKey: string,
    private publicKey: string = "",
    private baseUrl: string = defaultBase(),
  ) {}

  private headers() {
    return {
      "Private-Merchant-Id": this.privateKey,
      "content-type": "application/json",
    };
  }

  async createIntent(req: CreateIntentRequest): Promise<PaymentIntent> {
    const clientTxId = `${req.reference}-${Date.now()}`;

    // Embedded flow: the card token must have been minted client-side.
    if (!req.paymentToken) {
      return {
        status: "failed",
        clientTxId,
        redirectUrl: null,
        error: "No card token — the card wasn't collected.",
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/card/v1/charges`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          token: req.paymentToken,
          amount: {
            // No tax breakdown — the whole deposit sits in the 0% IVA bucket.
            subtotalIva0: major(req.amountCents),
            subtotalIva: 0,
            iva: 0,
            currency: req.currency,
          },
          // Our handle travels in metadata so the webhook can map back to us.
          metadata: {
            clientTxId,
            reservationId: req.reservationId,
            reference: req.reference,
          },
          contactDetails: req.customerEmail
            ? { email: req.customerEmail }
            : undefined,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ticketNumber?: string;
        transactionReference?: string;
        code?: string;
        message?: string;
      };

      if (!res.ok || !(data.ticketNumber || data.transactionReference)) {
        return {
          status: "failed",
          clientTxId,
          redirectUrl: null,
          error: data.message ?? `Kushki charge failed (${res.status})`,
        };
      }

      // Synchronous settlement — no redirect. provider_tx_id is the ticket.
      return {
        status: "completed",
        clientTxId,
        redirectUrl: null,
        providerTxId: String(data.ticketNumber ?? data.transactionReference),
      };
    } catch (err) {
      return {
        status: "failed",
        clientTxId,
        redirectUrl: null,
        error: (err as Error).message,
      };
    }
  }

  // Kushki charges settle at createIntent, so there's no redirect/confirm hop;
  // this just reports the charge as completed for interface completeness.
  async confirm(req: ConfirmRequest): Promise<ConfirmResult> {
    return {
      status: "completed",
      transactionId: req.providerTxId ?? req.clientTxId,
    };
  }

  // Full or partial refund/void: DELETE the charge by its ticket number.
  async refund(
    ticketNumber: string,
    amountCents: number,
  ): Promise<RefundResult> {
    try {
      const res = await fetch(`${this.baseUrl}/card/v1/charges/${ticketNumber}`, {
        method: "DELETE",
        headers: this.headers(),
        body: JSON.stringify({
          fullResponse: true,
          // A partial return sends the amount; a full void can omit it.
          amount: { subtotalIva0: major(amountCents), subtotalIva: 0, iva: 0 },
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        return {
          status: "failed",
          transactionId: ticketNumber,
          error: data.message ?? `Kushki refund failed (${res.status})`,
        };
      }
      return { status: "refunded", transactionId: ticketNumber };
    } catch (err) {
      return {
        status: "failed",
        transactionId: ticketNumber,
        error: (err as Error).message,
      };
    }
  }

  // Verify the HMAC-SHA256 signature (over `${timestamp}.${body}`) and normalise
  // the event. Our clientTxId rides back in the payload metadata.
  parseWebhook(
    raw: Buffer,
    headers: Record<string, string>,
    secret: string,
  ): WebhookEvent | null {
    const sig = headers["x-kushki-signature"];
    const ts = headers["x-kushki-id"];
    if (!sig || !ts || !secret) return null;

    const expected = createHmac("sha256", secret)
      .update(`${ts}.${raw.toString("utf8")}`)
      .digest("hex");
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    } catch {
      return null;
    }

    try {
      const body = JSON.parse(raw.toString("utf8")) as {
        id?: string;
        ticketNumber?: string;
        transactionReference?: string;
        transactionStatus?: string;
        status?: string;
        metadata?: { clientTxId?: string };
      };
      const clientTxId = body.metadata?.clientTxId;
      if (!clientTxId) return null;
      const ok = /approv|success|declined|failed/i.test(
        body.transactionStatus ?? body.status ?? "",
      );
      const approved = /approv|success/i.test(
        body.transactionStatus ?? body.status ?? "",
      );
      return {
        eventId:
          body.id ?? body.transactionReference ?? `${clientTxId}:${ts}`,
        clientTxId,
        providerTxId: String(
          body.ticketNumber ?? body.transactionReference ?? "",
        ),
        status: ok ? (approved ? "completed" : "failed") : "pending",
      };
    } catch {
      return null;
    }
  }

  // Reconciliation fallback. TODO(sandbox): wire Kushki's transaction-status
  // endpoint; until then report 'pending' so a stuck payment is left untouched.
  async getStatus(ref: {
    clientTxId: string;
    providerTxId?: string;
  }): Promise<ConfirmResult> {
    return {
      status: "pending",
      transactionId: ref.providerTxId ?? ref.clientTxId,
    };
  }
}
