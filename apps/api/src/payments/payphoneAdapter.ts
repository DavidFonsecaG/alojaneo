import type {
  ConfirmRequest,
  ConfirmResult,
  CreateIntentRequest,
  PaymentAdapter,
  PaymentIntent,
  RefundResult,
  WebhookEvent,
} from "./types.js";

// PayPhone ("Cajita de pagos" / Button) adapter — Ecuador's common gateway.
//
// Flow:
//   1. createIntent → POST /api/button/Prepare → get a paymentId, redirect the
//      guest to /api/button/Pay?id={paymentId}
//   2. PayPhone redirects back to returnUrl with ?id=<paymentId>&clientTxId=…
//   3. confirm → POST /api/button/V2/Confirm { id, clientTxId } → Approved/other
//
// Amounts are integer cents. This is scaffolded against PayPhone's documented
// shape; the exact field names and the Approved status check should be verified
// against the sandbox. Configure with PAYPHONE_TOKEN + PAYPHONE_STORE_ID
// (optional PAYPHONE_BASE_URL).
//
// TODO(sandbox): verify Prepare/Confirm request + response fields, the tax
// breakdown rules, and the Cancel/refund endpoint against a real PayPhone
// sandbox account before taking live payments.
const DEFAULT_BASE = "https://pay.payphonetodoesposible.com";

export class PayPhonePaymentAdapter implements PaymentAdapter {
  readonly name = "payphone";

  constructor(
    private token: string,
    private storeId: string,
    private baseUrl: string = process.env.PAYPHONE_BASE_URL ?? DEFAULT_BASE,
  ) {}

  private headers() {
    return {
      authorization: `Bearer ${this.token}`,
      "content-type": "application/json",
    };
  }

  async createIntent(req: CreateIntentRequest): Promise<PaymentIntent> {
    const clientTxId = `${req.reference}-${Date.now()}`;
    try {
      const res = await fetch(`${this.baseUrl}/api/button/Prepare`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          // No tax breakdown here; amountWithoutTax carries the full amount.
          amount: req.amountCents,
          amountWithoutTax: req.amountCents,
          tax: 0,
          service: 0,
          tip: 0,
          currency: req.currency,
          clientTransactionId: clientTxId,
          storeId: this.storeId,
          reference: req.description ?? req.reference,
          responseUrl: req.returnUrl,
          cancellationUrl: req.returnUrl,
          email: req.customerEmail,
        }),
      });
      if (!res.ok) {
        return {
          status: "failed",
          clientTxId,
          redirectUrl: null,
          error: `PayPhone prepare failed (${res.status})`,
        };
      }
      const data = (await res.json()) as { paymentId?: string | number };
      if (!data.paymentId) {
        return {
          status: "failed",
          clientTxId,
          redirectUrl: null,
          error: "PayPhone did not return a paymentId",
        };
      }
      return {
        status: "pending",
        clientTxId,
        redirectUrl: `${this.baseUrl}/api/button/Pay?id=${data.paymentId}`,
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

  async confirm(req: ConfirmRequest): Promise<ConfirmResult> {
    try {
      const res = await fetch(`${this.baseUrl}/api/button/V2/Confirm`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ id: req.providerTxId, clientTxId: req.clientTxId }),
      });
      if (!res.ok) {
        return {
          status: "failed",
          transactionId: req.clientTxId,
          error: `PayPhone confirm failed (${res.status})`,
        };
      }
      const data = (await res.json()) as {
        transactionStatus?: string;
        statusCode?: number;
        transactionId?: string | number;
        message?: string;
      };
      const approved =
        data.transactionStatus === "Approved" || data.statusCode === 3;
      return {
        status: approved ? "completed" : "failed",
        transactionId: String(data.transactionId ?? req.providerTxId ?? req.clientTxId),
        error: approved ? undefined : (data.message ?? "Payment not approved"),
      };
    } catch (err) {
      return {
        status: "failed",
        transactionId: req.clientTxId,
        error: (err as Error).message,
      };
    }
  }

  async refund(
    originalTransactionId: string,
    _amountCents: number,
  ): Promise<RefundResult> {
    try {
      const res = await fetch(`${this.baseUrl}/api/Sale/Cancel`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ id: Number(originalTransactionId) }),
      });
      if (!res.ok) {
        return {
          status: "failed",
          transactionId: originalTransactionId,
          error: `PayPhone cancel failed (${res.status})`,
        };
      }
      return { status: "refunded", transactionId: originalTransactionId };
    } catch (err) {
      return {
        status: "failed",
        transactionId: originalTransactionId,
        error: (err as Error).message,
      };
    }
  }

  // PayPhone settles through the return-URL confirm, not signed webhooks.
  parseWebhook(): WebhookEvent | null {
    return null;
  }

  // No cheap status-by-clientTx lookup without the provider id; report
  // 'pending' so reconciliation leaves the payment untouched rather than
  // wrongly cancelling it. TODO(sandbox): wire PayPhone's status endpoint.
  async getStatus(ref: {
    clientTxId: string;
    providerTxId?: string;
  }): Promise<ConfirmResult> {
    return { status: "pending", transactionId: ref.providerTxId ?? ref.clientTxId };
  }
}
