"use server";

import { z } from "zod";
import { defineAction } from "@/platform/actions";
import { requestApproval, requiresApproval } from "@/platform/approvals";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { getPaymentsClient, PaymentsError } from "@/platform/integrations";
import { formatCurrency } from "@/platform/ui/format";
import { REFUNDABLE_TRANSACTION_STATUS, REFUND_ACTION_TYPE, REFUND_REASONS, manifest, refundIdempotencyKey } from "./manifest";

// Every write in this tool is a defineAction export in this file.

const snapshot = (r: { status: string; amountCents: number; reason: string; transactionId: string; attempts: number; lastError: string | null; paymentRefundId: string | null }) => ({
  status: r.status,
  amountCents: r.amountCents,
  reason: r.reason,
  transactionId: r.transactionId,
  attempts: r.attempts,
  lastError: r.lastError,
  paymentRefundId: r.paymentRefundId,
});

/** Call the payments provider. Provider failures are returned, not thrown, so they get recorded. */
async function payRefund(transactionId: string, amountCents: number) {
  try {
    const res = await getPaymentsClient().refund({ transactionId, amountCents, idempotencyKey: refundIdempotencyKey(transactionId) });
    return { ok: true as const, paymentRefundId: res.refundId };
  } catch (err) {
    if (err instanceof PaymentsError) return { ok: false as const, error: err.message };
    throw err;
  }
}

/**
 * Support agents request a refund against a settled card transaction.
 * $100.00 or less executes immediately; more creates an approval that a
 * finance approver who isn't the requester must decide.
 */
export const requestRefund = defineAction({
  tool: "refunds",
  name: "refund.request",
  permission: "refunds:request",
  input: z.object({
    transactionId: z.string().min(1),
    amountCents: z.number().int().positive({ error: "Enter an amount above $0.00" }),
    reason: z.enum(REFUND_REASONS, { error: "Pick a reason" }),
    note: z.string().trim().max(500).optional(),
  }),
  run: async ({ input, user, tx }) => {
    const txn = await tx.cardTransaction.findUnique({ where: { id: input.transactionId } });
    if (!txn) throw new NotFoundError("Transaction");
    if (txn.status !== REFUNDABLE_TRANSACTION_STATUS) {
      throw new ConflictError(`Only settled transactions can be refunded (this one is ${txn.status}).`);
    }
    if (input.amountCents > txn.amountCents) {
      throw new ValidationError("The refund is larger than the original transaction.", [
        { path: "amountCents", message: `Can't exceed the original ${formatCurrency(txn.amountCents, txn.currency)}` },
      ]);
    }
    const existing = await tx.refund.findUnique({ where: { transactionId: txn.id } });
    if (existing) throw new ConflictError(`This transaction already has a refund (${existing.id}). Only one refund per transaction.`);

    const needsApproval = requiresApproval(manifest, input.amountCents);
    let refund = await tx.refund.create({
      data: {
        transactionId: txn.id,
        customerId: txn.customerId,
        amountCents: input.amountCents,
        currency: txn.currency,
        reason: input.reason,
        note: input.note || null,
        status: needsApproval ? "pending_approval" : "processing",
        requiresApproval: needsApproval,
        idempotencyKey: refundIdempotencyKey(txn.id),
        requestedById: user.id,
        requestedByName: user.name,
      },
    });

    if (needsApproval) {
      const approval = await requestApproval(
        user,
        {
          tool: manifest.slug,
          actionType: REFUND_ACTION_TYPE,
          entityType: "Refund",
          entityId: refund.id,
          payload: { refundId: refund.id, transactionId: txn.id, amountCents: input.amountCents },
          amountCents: input.amountCents,
          approvePermission: "refunds:approve",
          idempotencyKey: refund.idempotencyKey,
        },
        tx,
      );
      refund = await tx.refund.update({ where: { id: refund.id }, data: { approvalRequestId: approval.id } });
    } else {
      const paid = await payRefund(txn.id, input.amountCents);
      refund = await tx.refund.update({
        where: { id: refund.id },
        data: paid.ok
          ? { status: "executed", paymentRefundId: paid.paymentRefundId, executedAt: new Date(), attempts: 1, lastError: null }
          : { status: "failed", attempts: 1, lastError: paid.error },
      });
    }

    return {
      entityType: "Refund",
      entityId: refund.id,
      before: null,
      after: snapshot(refund),
      result: { refundId: refund.id, status: refund.status, requiresApproval: needsApproval },
      requestId: refund.approvalRequestId,
    };
  },
});

/**
 * Retry a failed refund that didn't need approval. Reuses the refund's
 * idempotency key, so the provider can never pay it twice. Failed refunds
 * that went through approval are retried from the approval panel.
 */
export const retryRefund = defineAction({
  tool: "refunds",
  name: "refund.retry",
  permission: "refunds:request",
  input: z.object({ refundId: z.string().min(1) }),
  run: async ({ input, tx }) => {
    const before = await tx.refund.findUnique({ where: { id: input.refundId } });
    if (!before) throw new NotFoundError("Refund");
    if (before.requiresApproval) throw new ConflictError("This refund went through approval. Retry it from the approval panel.");
    if (before.status !== "failed") throw new ConflictError(`Only failed refunds can be retried (this one is ${before.status}).`);

    const paid = await payRefund(before.transactionId, before.amountCents);
    const after = await tx.refund.update({
      where: { id: before.id },
      data: paid.ok
        ? { status: "executed", paymentRefundId: paid.paymentRefundId, executedAt: new Date(), attempts: { increment: 1 }, lastError: null }
        : { status: "failed", attempts: { increment: 1 }, lastError: paid.error },
    });
    return {
      entityType: "Refund",
      entityId: after.id,
      before: snapshot(before),
      after: snapshot(after),
      result: { refundId: after.id, status: after.status },
    };
  },
});
