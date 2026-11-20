import { describe, expect, it, vi } from "vitest";
import { approve, execute, registerExecutor, reject, requestApproval, requiresApproval } from "@/platform/approvals";
import { db } from "@/platform/db";
import { PermissionDeniedError, SelfApprovalError } from "@/platform/errors";
import { FakePaymentsClient, type RefundResult } from "@/platform/integrations";
import { makeUser } from "@/test/fixtures";

const maria = makeUser({ name: "Maria", roles: ["support_agent"] });
const dan = makeUser({ name: "Dan", roles: ["admin"] }); // has requests:approve
const alex = makeUser({ name: "Alex", roles: ["auditor"] });

const payments = new FakePaymentsClient({ failRate: 0 });
const refundRun = vi.fn(({ payload, idempotencyKey }: { payload: { transactionId: string; amountCents: number }; idempotencyKey: string }) =>
  payments.refund({ ...payload, idempotencyKey }),
);
registerExecutor<{ transactionId: string; amountCents: number }, RefundResult>("test.refund", { run: refundRun });

let flakyCalls = 0;
const flakyKeys: string[] = [];
registerExecutor("test.flaky", {
  run: async ({ idempotencyKey }) => {
    flakyKeys.push(idempotencyKey);
    if (++flakyCalls === 1) throw new Error("provider timeout");
    return { ok: true };
  },
});

const newRequest = (actionType = "test.refund") =>
  requestApproval(maria, {
    tool: "test",
    actionType,
    entityType: "CardTransaction",
    entityId: `txn_${Math.random().toString(36).slice(2)}`,
    payload: { transactionId: "txn_000001", amountCents: 12_500 },
    amountCents: 12_500,
    approvePermission: "requests:approve",
  });

const auditActions = async (id: string) =>
  (await db.auditEvent.findMany({ where: { entityType: "ApprovalRequest", entityId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })).map(
    (e) => e.action,
  );

describe("approvals engine", () => {
  it("never lets a requester approve or reject their own request", async () => {
    const req = await newRequest();
    const selfApprover = { ...maria, permissions: [...maria.permissions, "requests:approve" as const] };
    await expect(approve(selfApprover, req.id)).rejects.toBeInstanceOf(SelfApprovalError);
    await expect(reject(selfApprover, req.id, { reason: "no" })).rejects.toBeInstanceOf(SelfApprovalError);
    expect((await db.approvalRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("pending");
  });

  it("requires the decider to hold the request's approvePermission", async () => {
    const req = await newRequest();
    await expect(approve(alex, req.id)).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(reject(alex, req.id, { reason: "no" })).rejects.toBeInstanceOf(PermissionDeniedError);
    const approved = await approve(dan, req.id, { reason: "Looks right" });
    expect(approved).toMatchObject({ status: "approved", decidedById: dan.id });
  });

  it("does not decide twice", async () => {
    const req = await newRequest();
    await reject(dan, req.id, { reason: "Duplicate" });
    await expect(approve(dan, req.id)).rejects.toThrow(/already rejected/);
  });

  it("executes at most once per idempotency key", async () => {
    const req = await newRequest();
    await approve(dan, req.id);
    refundRun.mockClear();
    const [a, b] = await Promise.allSettled([execute(dan, req.id), execute(dan, req.id)]);
    const third = await execute(dan, req.id);
    expect(refundRun).toHaveBeenCalledTimes(1);
    expect([a, b].filter((r) => r.status === "fulfilled" && r.value.status === "executed")).not.toHaveLength(0);
    expect(third).toMatchObject({ status: "executed", alreadyExecuted: true });
    expect(payments.calls.filter((c) => c.idempotencyKey === req.idempotencyKey)).toHaveLength(1);
  });

  it("reuses the idempotency key when retrying a failure", async () => {
    const req = await newRequest("test.flaky");
    await approve(dan, req.id);
    const first = await execute(dan, req.id);
    expect(first).toMatchObject({ status: "failed", error: "provider timeout" });
    const second = await execute(dan, req.id);
    expect(second.status).toBe("executed");
    expect(flakyKeys).toEqual([req.idempotencyKey, req.idempotencyKey]);
  });

  it("refuses to execute requests that aren't approved", async () => {
    const req = await newRequest();
    await expect(execute(dan, req.id)).rejects.toThrow(/Only approved/);
  });

  it("audits every transition", async () => {
    const executed = await newRequest();
    await approve(dan, executed.id);
    await execute(dan, executed.id);
    expect(await auditActions(executed.id)).toEqual(["approval.request", "approval.approve", "approval.execute"]);

    const rejected = await newRequest();
    await reject(dan, rejected.id, { reason: "Not eligible" });
    expect(await auditActions(rejected.id)).toEqual(["approval.request", "approval.reject"]);

    flakyCalls = 0;
    const retried = await newRequest("test.flaky");
    await approve(dan, retried.id);
    await execute(dan, retried.id);
    await execute(dan, retried.id);
    expect(await auditActions(retried.id)).toEqual(["approval.request", "approval.approve", "approval.fail", "approval.execute"]);
  });

  it("applies per-tool thresholds", () => {
    expect(requiresApproval({ approvalThresholdCents: 10_000 }, 9_999)).toBe(false);
    expect(requiresApproval({ approvalThresholdCents: 10_000 }, 10_000)).toBe(true);
    expect(requiresApproval({}, 1_000_000)).toBe(false);
  });
});
