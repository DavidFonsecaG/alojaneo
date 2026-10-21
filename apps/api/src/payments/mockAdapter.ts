import { randomUUID } from "node:crypto";
import type {
  ConfirmRequest,
  ConfirmResult,
  CreateIntentRequest,
  PaymentAdapter,
  PaymentIntent,
  RefundResult,
  WebhookEvent,
} from "./types.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A stand-in gateway for local dev and tests. It settles instantly, with
// deterministic hooks so the decline and redirect paths stay testable without
// a real card:
//   • customerEmail containing "decline" (or amount 666) → declined
//   • customerEmail containing "redirect" → a pending intent with a redirect
//     URL that points straight back to returnUrl (simulating a hosted-checkout
//     hop), so the confirm step can be exercised
// Everything else settles as "completed" immediately.
export class MockPaymentAdapter implements PaymentAdapter {
  readonly name = "mock";

  async createIntent(req: CreateIntentRequest): Promise<PaymentIntent> {
    await delay(100);
    const clientTxId = `mock_${randomUUID()}`;
    const email = (req.customerEmail ?? "").toLowerCase();

    if (email.includes("decline") || req.amountCents === 666) {
      return {
        status: "failed",
        clientTxId,
        redirectUrl: null,
        error: "Card declined (mock)",
      };
    }
    if (email.includes("redirect")) {
      const sep = req.returnUrl.includes("?") ? "&" : "?";
      return {
        status: "pending",
        clientTxId,
        redirectUrl: `${req.returnUrl}${sep}clientTxId=${clientTxId}&mock=1`,
      };
    }
    return { status: "completed", clientTxId, redirectUrl: null };
  }

  async confirm(req: ConfirmRequest): Promise<ConfirmResult> {
    await delay(100);
    return {
      status: "completed",
      transactionId: req.providerTxId ?? req.clientTxId,
    };
  }

  async refund(
    _originalTransactionId: string,
    _amountCents: number,
  ): Promise<RefundResult> {
    await delay(100);
    return { status: "refunded", transactionId: `mock_re_${randomUUID()}` };
  }

  // The mock settles instantly, so a stuck 'pending' is always "completed".
  async getStatus(ref: {
    clientTxId: string;
    providerTxId?: string;
  }): Promise<ConfirmResult> {
    return {
      status: "completed",
      transactionId: ref.providerTxId ?? ref.clientTxId,
    };
  }

  // A tiny test webhook: a JSON body of { clientTxId, status?, eventId? }
  // settles that payment, so the webhook route can be exercised without a real
  // gateway. No signature to verify.
  parseWebhook(raw: Buffer): WebhookEvent | null {
    try {
      const b = JSON.parse(raw.toString("utf8")) as {
        clientTxId?: string;
        status?: string;
        eventId?: string;
      };
      if (!b.clientTxId) return null;
      const status = b.status === "failed" ? "failed" : "completed";
      return {
        eventId: b.eventId ?? `mock_evt_${b.clientTxId}`,
        clientTxId: b.clientTxId,
        providerTxId: b.clientTxId,
        status,
      };
    } catch {
      return null;
    }
  }
}
