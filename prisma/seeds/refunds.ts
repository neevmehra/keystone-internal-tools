/**
 * Refunds seed: 300 refunds across every status, plus their approval
 * requests and audit history, so the queue, stat cards and detail pages
 * look like a working team's. Deterministic. Fake data only.
 *
 * Includes one known record for demos: ref_demo_pending, a $250.00 refund
 * maria requested that's waiting for a finance approver.
 */
import { createHash } from "node:crypto";
import { faker } from "@faker-js/faker";
import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;
type SeedTxn = { id: string; customerId: string; amountCents: number; status: string; createdAt: Date };
type SeedUser = { id: string; name: string; roles: string[] };

const REASONS = ["duplicate_charge", "product_not_received", "service_issue", "fraud", "other"] as const;
const REJECT_REASONS = [
  "Outside the refund policy window",
  "Customer already received a chargeback credit",
  "Duplicate of an earlier credit",
  "Needs merchant confirmation first",
];
const APPROVE_REASONS = ["Matches policy", "Verified with the merchant", "Confirmed duplicate charge", undefined];
const NOTES = [
  "Customer called twice about this charge.",
  "Merchant confirmed the order never shipped.",
  "Charged twice within a minute.",
  "Service outage on our side, goodwill refund.",
  undefined,
];
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const THRESHOLD = 10_001;

const key = (transactionId: string) => `refund:${transactionId}`;
const providerId = (k: string) => `re_${createHash("sha256").update(k).digest("hex").slice(0, 16)}`;
const json = (v: unknown) => JSON.stringify(v);

export async function seedRefunds(tx: Tx, opts: { transactions: SeedTxn[]; users: Record<string, SeedUser>; anchor: Date }) {
  if ((await tx.refund.count()) > 0) return 0;
  faker.seed(20261120);
  const { users, anchor } = opts;
  const requesters = [users.maria, users.maria, users.maria, users.sam, users.sam];
  const approvers = [users.dan, users.priya];
  // Never in the future, even when seeding just after UTC midnight.
  const end = Math.min(anchor.getTime(), Date.now() - 10 * MIN);
  const clamp = (ms: number) => new Date(Math.min(ms, end));

  const settled = opts.transactions.filter((t) => t.status === "settled").sort((a, b) => a.id.localeCompare(b.id));
  const small = settled.filter((t) => t.amountCents < THRESHOLD);
  const large = settled.filter((t) => t.amountCents >= 30_000);
  const demoTxn = large[0];
  const autoPicks = faker.helpers.arrayElements(small, Math.min(110, small.length));
  const approvalPicks = faker.helpers.arrayElements(large.slice(1), 189);

  const refunds: Prisma.RefundCreateManyInput[] = [];
  const approvals: Prisma.ApprovalRequestCreateManyInput[] = [];
  const audits: Prisma.AuditEventCreateManyInput[] = [];
  const audit = (e: Omit<Prisma.AuditEventCreateManyInput, "tool" | "actorRoles" | "actorId" | "actorName"> & { actor: SeedUser }) => {
    const { actor, ...rest } = e;
    audits.push({ ...rest, tool: "refunds", actorId: actor.id, actorName: actor.name, actorRoles: json(actor.roles) });
  };

  // Under the threshold: executed at once (a few failed at the provider).
  autoPicks.forEach((t, i) => {
    const id = `ref_${String(i + 1).padStart(5, "0")}`;
    const requester = faker.helpers.arrayElement(requesters);
    const createdAt = clamp(Math.max(t.createdAt.getTime() + HOUR, end - faker.number.int({ min: 1, max: 45 }) * DAY + faker.number.int({ min: 0, max: DAY })));
    const amountCents = faker.datatype.boolean(0.7) ? t.amountCents : faker.number.int({ min: Math.min(500, t.amountCents), max: t.amountCents });
    const failed = i % 11 === 0;
    const k = key(t.id);
    const status = failed ? "failed" : "executed";
    refunds.push({
      id, transactionId: t.id, customerId: t.customerId, amountCents, currency: "USD",
      reason: faker.helpers.arrayElement(REASONS), note: faker.helpers.arrayElement(NOTES) ?? null,
      status, requiresApproval: false, idempotencyKey: k,
      paymentRefundId: failed ? null : providerId(k), attempts: 1, lastError: failed ? "Fake payments provider failure" : null,
      requestedById: requester.id, requestedByName: requester.name,
      executedAt: failed ? null : new Date(createdAt.getTime() + 2_000), createdAt, updatedAt: createdAt,
    });
    audit({
      actor: requester, action: "refund.request", entityType: "Refund", entityId: id, createdAt,
      before: null, after: json({ status, amountCents, transactionId: t.id, attempts: 1 }),
    });
  });

  // Over the threshold: pending, executed, rejected or failed after approval.
  const plan = [
    ...Array<string>(34).fill("pending"),
    ...Array<string>(110).fill("executed"),
    ...Array<string>(25).fill("rejected"),
    ...Array<string>(20).fill("failed"),
  ];
  approvalPicks.forEach((t, i) => {
    const outcome = plan[i];
    const id = `ref_${String(autoPicks.length + i + 1).padStart(5, "0")}`;
    const aprId = `apr_seed_${String(i + 1).padStart(5, "0")}`;
    const requester = faker.helpers.arrayElement(requesters);
    const approver = faker.helpers.arrayElement(approvers);
    const ageMs = outcome === "pending" ? faker.number.int({ min: 20 * MIN, max: 4 * DAY }) : faker.number.int({ min: 2 * DAY, max: 60 * DAY });
    const createdAt = clamp(Math.max(t.createdAt.getTime() + HOUR, end - ageMs));
    const decidedAt = outcome === "pending" ? null : clamp(createdAt.getTime() + faker.number.int({ min: 6 * MIN, max: 30 * HOUR }));
    const amountCents = faker.datatype.boolean(0.7) ? t.amountCents : faker.number.int({ min: THRESHOLD, max: t.amountCents });
    const k = key(t.id);
    const executedAt = outcome === "executed" && decidedAt ? new Date(decidedAt.getTime() + 2_000) : null;
    const decisionReason = outcome === "rejected" ? faker.helpers.arrayElement(REJECT_REASONS) : outcome === "pending" ? null : (faker.helpers.arrayElement(APPROVE_REASONS) ?? null);

    refunds.push({
      id, transactionId: t.id, customerId: t.customerId, amountCents, currency: "USD",
      reason: faker.helpers.arrayElement(REASONS), note: faker.helpers.arrayElement(NOTES) ?? null,
      status: executedAt ? "executed" : "pending_approval", requiresApproval: true, approvalRequestId: aprId, idempotencyKey: k,
      paymentRefundId: executedAt ? providerId(k) : null, attempts: 0,
      requestedById: requester.id, requestedByName: requester.name,
      executedAt, createdAt, updatedAt: executedAt ?? createdAt,
    });
    approvals.push({
      id: aprId, tool: "refunds", actionType: "refunds.refund", entityType: "Refund", entityId: id,
      payload: json({ refundId: id, transactionId: t.id, amountCents }), amountCents,
      status: outcome, requestedById: requester.id, requestedByName: requester.name,
      decidedById: decidedAt ? approver.id : null, decidedByName: decidedAt ? approver.name : null, decidedAt,
      reason: decisionReason, approvePermission: "refunds:approve", idempotencyKey: k,
      attempts: outcome === "executed" || outcome === "failed" ? 1 : 0,
      result: executedAt ? json({ refundId: providerId(k), transactionId: t.id, amountCents, status: "succeeded", idempotencyKey: k }) : null,
      lastError: outcome === "failed" ? "Fake payments provider failure" : null,
      executedAt, createdAt, updatedAt: executedAt ?? decidedAt ?? createdAt,
    });

    const snap = (status: string, extra: Record<string, unknown> = {}) => json({ status, decidedById: null, reason: null, attempts: 0, lastError: null, ...extra });
    audit({ actor: requester, action: "refund.request", entityType: "Refund", entityId: id, createdAt, before: null, after: json({ status: "pending_approval", amountCents, transactionId: t.id, attempts: 0 }), requestId: aprId });
    audit({ actor: requester, action: "approval.request", entityType: "ApprovalRequest", entityId: aprId, createdAt, before: null, after: snap("pending"), requestId: aprId });
    if (decidedAt) {
      const decided = outcome === "rejected" ? "rejected" : "approved";
      audit({
        actor: approver, action: outcome === "rejected" ? "approval.reject" : "approval.approve", entityType: "ApprovalRequest", entityId: aprId,
        createdAt: decidedAt, before: snap("pending"), after: snap(decided, { decidedById: approver.id, reason: decisionReason }), requestId: aprId,
      });
      if (outcome === "executed" || outcome === "failed") {
        audit({
          actor: approver, action: outcome === "executed" ? "approval.execute" : "approval.fail", entityType: "ApprovalRequest", entityId: aprId,
          createdAt: new Date(decidedAt.getTime() + 2_000), before: snap("approved", { decidedById: approver.id, reason: decisionReason }),
          after: snap(outcome, { decidedById: approver.id, reason: decisionReason, attempts: 1, lastError: outcome === "failed" ? "Fake payments provider failure" : null }),
          requestId: aprId,
        });
      }
    }
  });

  // The demo record: maria's $250.00 refund, waiting on dan or priya.
  const demoCreated = clamp(Math.max(demoTxn.createdAt.getTime() + HOUR, end - 2 * HOUR));
  const demoKey = key(demoTxn.id);
  refunds.push({
    id: "ref_demo_pending", transactionId: demoTxn.id, customerId: demoTxn.customerId, amountCents: 25_000, currency: "USD",
    reason: "product_not_received", note: "Customer says the order never arrived. Merchant hasn't responded in 10 days.",
    status: "pending_approval", requiresApproval: true, approvalRequestId: "apr_demo_pending", idempotencyKey: demoKey, attempts: 0,
    requestedById: users.maria.id, requestedByName: users.maria.name, createdAt: demoCreated, updatedAt: demoCreated,
  });
  approvals.push({
    id: "apr_demo_pending", tool: "refunds", actionType: "refunds.refund", entityType: "Refund", entityId: "ref_demo_pending",
    payload: json({ refundId: "ref_demo_pending", transactionId: demoTxn.id, amountCents: 25_000 }), amountCents: 25_000, status: "pending",
    requestedById: users.maria.id, requestedByName: users.maria.name, approvePermission: "refunds:approve", idempotencyKey: demoKey,
    createdAt: demoCreated, updatedAt: demoCreated,
  });
  audit({ actor: users.maria, action: "refund.request", entityType: "Refund", entityId: "ref_demo_pending", createdAt: demoCreated, before: null, after: json({ status: "pending_approval", amountCents: 25_000, transactionId: demoTxn.id, attempts: 0 }), requestId: "apr_demo_pending" });
  audit({ actor: users.maria, action: "approval.request", entityType: "ApprovalRequest", entityId: "apr_demo_pending", createdAt: demoCreated, before: null, after: json({ status: "pending", decidedById: null, reason: null, attempts: 0, lastError: null }), requestId: "apr_demo_pending" });

  for (let i = 0; i < refunds.length; i += 200) await tx.refund.createMany({ data: refunds.slice(i, i + 200) });
  for (let i = 0; i < approvals.length; i += 200) await tx.approvalRequest.createMany({ data: approvals.slice(i, i + 200) });
  for (let i = 0; i < audits.length; i += 200) await tx.auditEvent.createMany({ data: audits.slice(i, i + 200) });
  return refunds.length;
}
