// Payment gateway abstraction. The booking flow talks to a PaymentAdapter, not
// a specific provider, so a real gateway (PayPhone, PlacetoPay, …) drops in
// behind the same interface.
//
// Real gateways are redirect/3-D-Secure based, so a charge is two steps:
//   createIntent → (optionally redirect the guest) → confirm
// The mock settles instantly (no redirect), so it returns status "completed"
// straight from createIntent and never needs the redirect/confirm hop.

export type PaymentStatus = "completed" | "failed" | "pending";

export interface CreateIntentRequest {
  reservationId: string;
  amountCents: number;
  currency: string;
  reference: string; // our booking reference, e.g. "BK-1042"
  description?: string;
  customerEmail?: string;
  // Where the gateway returns the guest after paying (carries our clientTxId).
  returnUrl: string;
  // Token-based gateways (Kushki): the card token minted client-side by the
  // gateway's SDK. Redirect gateways (PayPhone) ignore it.
  paymentToken?: string;
}

export interface PaymentIntent {
  // "completed" settled instantly; "pending" needs the redirect + confirm hop;
  // "failed" was declined at creation.
  status: PaymentStatus;
  // Our handle for this attempt — stored on payments.client_tx_id.
  clientTxId: string;
  // Present when the guest must be sent to the gateway's hosted checkout.
  redirectUrl: string | null;
  // The gateway's transaction id when it settled instantly (a token charge);
  // null for redirect flows, where settlePayment fills it on confirm.
  providerTxId?: string | null;
  error?: string;
}

export interface ConfirmRequest {
  clientTxId: string; // the attempt to confirm
  providerTxId?: string; // the gateway's id from the return (e.g. PayPhone's `id`)
  amountCents: number; // expected amount, for verification
  currency: string;
}

export interface ConfirmResult {
  status: PaymentStatus; // "completed" | "failed"
  transactionId: string; // final gateway transaction id
  error?: string;
}

export interface RefundResult {
  status: "refunded" | "failed";
  transactionId: string;
  error?: string;
}

// A settlement event parsed from an inbound gateway webhook (normalised across
// providers). eventId drives idempotency; clientTxId maps back to our payment.
export interface WebhookEvent {
  eventId: string;
  clientTxId: string;
  providerTxId: string;
  status: PaymentStatus; // completed | failed | pending
  amountCents?: number; // for cross-checking the expected amount
}

export interface PaymentAdapter {
  // Stored as payments.provider so the source of a payment is auditable.
  readonly name: string;
  createIntent(req: CreateIntentRequest): Promise<PaymentIntent>;
  confirm(req: ConfirmRequest): Promise<ConfirmResult>;
  refund(
    originalTransactionId: string,
    amountCents: number,
  ): Promise<RefundResult>;
  // Verify + normalise an inbound webhook. Returns null when the signature is
  // invalid or the payload isn't a settlement event we handle.
  parseWebhook(
    raw: Buffer,
    headers: Record<string, string>,
    secret: string,
  ): WebhookEvent | null;
  // Poll the gateway for a transaction's current status — the reconciliation
  // fallback for payments stuck 'pending' (guest never returned, no webhook).
  getStatus(ref: {
    clientTxId: string;
    providerTxId?: string;
  }): Promise<ConfirmResult>;
}
