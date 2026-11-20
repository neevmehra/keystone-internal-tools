/**
 * Executes approved refunds. The approvals engine calls run() at most once per
 * idempotency key, then commits apply(), the "executed" status and its audit
 * event in one transaction. Provider failures leave the approval "failed" and
 * retryable with the same key.
 */
import { registerExecutor } from "@/platform/approvals";
import { getPaymentsClient, type RefundResult } from "@/platform/integrations";
import { REFUND_ACTION_TYPE } from "./manifest";

type RefundPayload = { refundId: string; transactionId: string; amountCents: number };

registerExecutor<RefundPayload, RefundResult>(REFUND_ACTION_TYPE, {
  run: ({ payload, idempotencyKey }) =>
    getPaymentsClient().refund({ transactionId: payload.transactionId, amountCents: payload.amountCents, idempotencyKey }),
  apply: async ({ tx, payload, result }) => {
    await tx.refund.update({
      where: { id: payload.refundId },
      data: { status: "executed", paymentRefundId: result.refundId, executedAt: new Date(), lastError: null },
    });
  },
});
