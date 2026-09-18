import { randomUUID } from "node:crypto";
import type {
  ChargeRequest,
  ChargeResult,
  PaymentAdapter,
  RefundResult,
} from "./types.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A stand-in gateway for local dev and tests. It approves instantly, with two
// deterministic hooks so the decline path stays testable without a real card:
//   • a customerEmail containing "decline" is declined
//   • an amount of exactly 666 cents ($6.66) is declined
// A real adapter would collect card details / redirect to the provider and
// verify the result via webhook; none of that is needed for the mock.
export class MockPaymentAdapter implements PaymentAdapter {
  readonly name = "mock";

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    await delay(150);
    const declined =
      (req.customerEmail ?? "").toLowerCase().includes("decline") ||
      req.amountCents === 666;
    if (declined) {
      return {
        status: "failed",
        transactionId: `mock_${randomUUID()}`,
        error: "Card declined (mock)",
      };
    }
    return { status: "completed", transactionId: `mock_${randomUUID()}` };
  }

  async refund(
    _originalTransactionId: string,
    _amountCents: number,
  ): Promise<RefundResult> {
    await delay(100);
    return { status: "refunded", transactionId: `mock_re_${randomUUID()}` };
  }
}
