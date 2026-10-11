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
}

export interface PaymentIntent {
  // "completed" settled instantly; "pending" needs the redirect + confirm hop;
  // "failed" was declined at creation.
  status: PaymentStatus;
  // Our handle for this attempt — stored on payments.reference until confirmed.
  clientTxId: string;
  // Present when the guest must be sent to the gateway's hosted checkout.
  redirectUrl: string | null;
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

export interface PaymentAdapter {
  // Stored as payments.method so the source of a payment is auditable.
  readonly name: string;
  createIntent(req: CreateIntentRequest): Promise<PaymentIntent>;
  confirm(req: ConfirmRequest): Promise<ConfirmResult>;
  refund(
    originalTransactionId: string,
    amountCents: number,
  ): Promise<RefundResult>;
}
