import type { ToolManifest } from "@/platform/manifest";

export const manifest = {
  slug: "refunds",
  name: "Refunds",
  description: "Request, approve and track customer refunds",
  icon: "ReceiptText",
  ownerTeam: "Payments Ops",
  sensitivity: "money",
  readPermission: "refunds:read",
  piiFields: ["customerEmail"],
  nav: [
    { label: "Queue", href: "/tools/refunds" },
    { label: "New refund", href: "/tools/refunds/new" },
  ],
  // Refunds of $100.00 or less execute immediately. requiresApproval() treats
  // amounts at or above the threshold as needing approval, so "over $100.00"
  // means a threshold of 10,001 cents.
  approvalThresholdCents: 10_001,
} satisfies ToolManifest;

export const REFUND_REASONS = ["duplicate_charge", "product_not_received", "service_issue", "fraud", "other"] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export const REFUND_STATUSES = ["pending_approval", "approved", "rejected", "executed", "failed"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/** Only settled card transactions can be refunded. */
export const REFUNDABLE_TRANSACTION_STATUS = "settled";

/** The executor's action type, registered with the approvals engine. */
export const REFUND_ACTION_TYPE = "refunds.refund";

/**
 * One refund per transaction, so the transaction ID is a stable payment
 * idempotency key: retries (and replays after a rollback) can never refund
 * the same transaction twice.
 */
export const refundIdempotencyKey = (transactionId: string) => `refund:${transactionId}`;
