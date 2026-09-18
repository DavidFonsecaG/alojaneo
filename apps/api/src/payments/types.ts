// Payment gateway abstraction. The booking flow talks to a PaymentAdapter, not
// a specific provider, so a real gateway (PayPhone, PlacetoPay, …) can be
// dropped in behind the same interface without touching the booking code.

export type ChargeStatus = "completed" | "failed" | "pending";

export interface ChargeRequest {
  amountCents: number;
  currency: string;
  reference: string; // our booking reference, e.g. "BK-1042"
  description?: string;
  customerEmail?: string;
}

export interface ChargeResult {
  status: ChargeStatus;
  transactionId: string; // gateway transaction id — stored on payments.reference
  error?: string; // set when status === "failed"
}

export interface RefundResult {
  status: "refunded" | "failed";
  transactionId: string;
  error?: string;
}

export interface PaymentAdapter {
  // Stored as payments.method so the source of a payment is auditable.
  readonly name: string;
  charge(req: ChargeRequest): Promise<ChargeResult>;
  refund(originalTransactionId: string, amountCents: number): Promise<RefundResult>;
}
