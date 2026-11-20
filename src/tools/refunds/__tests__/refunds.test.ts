import { beforeEach, describe, expect, it, vi } from "vitest";
import { approve, execute } from "@/platform/approvals";
import { getCurrentUser } from "@/platform/auth/current-user";
import { db } from "@/platform/db";
import { SelfApprovalError } from "@/platform/errors";
import { FakePaymentsClient } from "@/platform/integrations";
import { makeTransaction, makeUser } from "@/test/fixtures";
import { requestRefund, retryRefund } from "../actions";
import "../executors";
import { manifest, refundIdempotencyKey } from "../manifest";
import { effectiveStatus, getRefund, listRefunds, median } from "../queries";

vi.mock("@/platform/auth/current-user", () => ({ getCurrentUser: vi.fn() }));

const maria = makeUser({ name: "Maria Lopez", roles: ["support_agent"] });
const dan = makeUser({ name: "Dan Weber", roles: ["finance_approver"] });
const alex = makeUser({ name: "Alex Kim", roles: ["auditor"] });

const setPayments = (client: FakePaymentsClient) => {
  (globalThis as { keystonePayments?: unknown }).keystonePayments = client;
  return client;
};
const asUser = (u: ReturnType<typeof makeUser>) => vi.mocked(getCurrentUser).mockResolvedValue(u);

describe("refunds", () => {
  let payments: FakePaymentsClient;
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockReset();
    payments = setPayments(new FakePaymentsClient({ failRate: 0 }));
    asUser(maria);
  });

  it("rejects a refund larger than the original transaction and writes nothing", async () => {
    const txn = await makeTransaction({ amountCents: 4_000 });
    const res = await requestRefund({ transactionId: txn.id, amountCents: 4_001, reason: "other" });
    expect(res).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", issues: [{ path: "amountCents" }] } });
    expect(await db.refund.count({ where: { transactionId: txn.id } })).toBe(0);
    expect(payments.calls).toHaveLength(0);
  });

  it("rejects a second refund on the same transaction", async () => {
    const txn = await makeTransaction({ amountCents: 9_000 });
    expect((await requestRefund({ transactionId: txn.id, amountCents: 1_000, reason: "duplicate_charge" })).ok).toBe(true);
    const second = await requestRefund({ transactionId: txn.id, amountCents: 1_000, reason: "duplicate_charge" });
    expect(second).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await db.refund.count({ where: { transactionId: txn.id } })).toBe(1);
    expect(payments.calls).toHaveLength(1);
  });

  it("only refunds settled transactions", async () => {
    for (const status of ["pending", "declined", "refunded"]) {
      const txn = await makeTransaction({ status });
      const res = await requestRefund({ transactionId: txn.id, amountCents: 1_000, reason: "other" });
      expect(res).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    }
  });

  it("executes $100.00 or less immediately, without an approval", async () => {
    const txn = await makeTransaction({ amountCents: 20_000 });
    const res = await requestRefund({ transactionId: txn.id, amountCents: 10_000, reason: "service_issue" });
    expect(res).toMatchObject({ ok: true, result: { status: "executed", requiresApproval: false } });
    const refund = await db.refund.findUniqueOrThrow({ where: { transactionId: txn.id } });
    expect(refund).toMatchObject({ status: "executed", requiresApproval: false, approvalRequestId: null, attempts: 1 });
    expect(refund.paymentRefundId).toMatch(/^re_/);
    expect(await db.approvalRequest.count({ where: { entityType: "Refund", entityId: refund.id } })).toBe(0);
    expect(payments.calls).toEqual([{ transactionId: txn.id, amountCents: 10_000, idempotencyKey: refundIdempotencyKey(txn.id) }]);
  });

  it("sends refunds over $100.00 to a finance approver who isn't the requester", async () => {
    const txn = await makeTransaction({ amountCents: 30_000 });
    const res = await requestRefund({ transactionId: txn.id, amountCents: 10_001, reason: "product_not_received" });
    expect(res).toMatchObject({ ok: true, result: { status: "pending_approval", requiresApproval: true } });
    expect(payments.calls).toHaveLength(0);

    const refund = await db.refund.findUniqueOrThrow({ where: { transactionId: txn.id } });
    const approval = await db.approvalRequest.findUniqueOrThrow({ where: { id: refund.approvalRequestId! } });
    expect(approval).toMatchObject({
      tool: manifest.slug,
      status: "pending",
      approvePermission: "refunds:approve",
      amountCents: 10_001,
      requestedById: maria.id,
      idempotencyKey: refundIdempotencyKey(txn.id),
    });

    // Maria can't approve her own refund, even if she had the permission.
    const mariaWithApprove = { ...maria, permissions: [...maria.permissions, "refunds:approve" as const] };
    await expect(approve(mariaWithApprove, approval.id)).rejects.toBeInstanceOf(SelfApprovalError);

    await approve(dan, approval.id, { reason: "Matches policy" });
    const outcome = await execute(dan, approval.id);
    expect(outcome.status).toBe("executed");
    expect(await db.refund.findUniqueOrThrow({ where: { id: refund.id } })).toMatchObject({ status: "executed" });
    expect(payments.calls).toEqual([{ transactionId: txn.id, amountCents: 10_001, idempotencyKey: refundIdempotencyKey(txn.id) }]);
  });

  it("retries a failed refund with the same idempotency key", async () => {
    const txn = await makeTransaction({ amountCents: 5_000 });
    const failing = setPayments(new FakePaymentsClient({ failRate: 1 }));
    const res = await requestRefund({ transactionId: txn.id, amountCents: 5_000, reason: "fraud" });
    expect(res).toMatchObject({ ok: true, result: { status: "failed" } });
    const refund = await db.refund.findUniqueOrThrow({ where: { transactionId: txn.id } });
    expect(refund.lastError).toMatch(/failure/);

    const working = setPayments(new FakePaymentsClient({ failRate: 0 }));
    const retried = await retryRefund({ refundId: refund.id });
    expect(retried).toMatchObject({ ok: true, result: { status: "executed" } });
    expect(await db.refund.findUniqueOrThrow({ where: { id: refund.id } })).toMatchObject({ status: "executed", attempts: 2, lastError: null });
    expect([...failing.calls, ...working.calls].map((c) => c.idempotencyKey)).toEqual([refundIdempotencyKey(txn.id), refundIdempotencyKey(txn.id)]);

    // Nothing left to retry.
    expect(await retryRefund({ refundId: refund.id })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await db.auditEvent.count({ where: { entityType: "Refund", entityId: refund.id } })).toBe(2);
  });

  it("retries a failed approved refund through the approvals engine with the same key", async () => {
    const txn = await makeTransaction({ amountCents: 50_000 });
    await requestRefund({ transactionId: txn.id, amountCents: 25_000, reason: "product_not_received" });
    const refund = await db.refund.findUniqueOrThrow({ where: { transactionId: txn.id } });

    const failing = setPayments(new FakePaymentsClient({ failRate: 1 }));
    await approve(dan, refund.approvalRequestId!);
    expect((await execute(dan, refund.approvalRequestId!)).status).toBe("failed");
    const failedRow = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    const failedApproval = await db.approvalRequest.findUniqueOrThrow({ where: { id: refund.approvalRequestId! } });
    expect(effectiveStatus(failedRow, failedApproval)).toBe("failed");

    // The approver retries from the approval panel; retryRefund refuses approval-path refunds.
    expect(await retryRefund({ refundId: refund.id })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    const working = setPayments(new FakePaymentsClient({ failRate: 0 }));
    expect((await execute(dan, refund.approvalRequestId!)).status).toBe("executed");
    expect([...failing.calls, ...working.calls].map((c) => c.idempotencyKey)).toEqual([refundIdempotencyKey(txn.id), refundIdempotencyKey(txn.id)]);
    expect((await db.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe("executed");
  });

  it("masks customer emails for auditors on the server", async () => {
    const txn = await makeTransaction({ amountCents: 3_000 });
    await requestRefund({ transactionId: txn.id, amountCents: 3_000, reason: "other" });
    const refund = await db.refund.findUniqueOrThrow({ where: { transactionId: txn.id } });

    expect((await getRefund(maria, refund.id))?.customerEmail).toBe("test.customer@example.com");
    expect((await getRefund(alex, refund.id))?.customerEmail).toBe("t•••@example.com");

    const page = { page: 1, pageSize: 25, sort: "createdAt" as const, dir: "desc" as const, skip: 0, take: 25, filters: { q: refund.id } };
    const { rows } = await listRefunds(alex, page);
    expect(rows.map((r) => r.customerEmail)).toEqual(["t•••@example.com"]);
  });

  it("filters by status using the approval's status for approval-path refunds", async () => {
    const txn = await makeTransaction({ amountCents: 40_000 });
    await requestRefund({ transactionId: txn.id, amountCents: 20_000, reason: "service_issue" });
    const refund = await db.refund.findUniqueOrThrow({ where: { transactionId: txn.id } });
    const base = { page: 1, pageSize: 100, sort: "createdAt" as const, dir: "desc" as const, skip: 0, take: 100 };

    const pending = await listRefunds(dan, { ...base, filters: { status: "pending_approval", q: refund.id } });
    expect(pending.rows.map((r) => r.id)).toEqual([refund.id]);

    await approve(dan, refund.approvalRequestId!);
    await execute(dan, refund.approvalRequestId!);
    expect((await listRefunds(dan, { ...base, filters: { status: "pending_approval", q: refund.id } })).rows).toEqual([]);
    expect((await listRefunds(dan, { ...base, filters: { status: "executed", q: refund.id } })).rows.map((r) => r.effectiveStatus)).toEqual(["executed"]);
  });

  it("computes medians", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
