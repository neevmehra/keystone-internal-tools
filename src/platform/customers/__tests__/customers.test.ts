import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/platform/db";
import type { CustomerPanel } from "@/platform/manifest";
import { makeCustomer, makeUser } from "@/test/fixtures";
import {
  getCustomer,
  getCustomerTimeline,
  panelsForUser,
  recordCustomerView,
  searchCustomers,
} from "../index";

/** Test-only fixture inserts (fake data). */
async function makeTxn(customerId: string, createdAt: Date, amountCents = 5_000) {
  return db.cardTransaction.create({
    data: {
      id: `txn_t_${randomUUID()}`,
      customerId,
      amountCents,
      merchant: "Test Merchant",
      category: "Shopping",
      cardLast4: "4242",
      status: "settled",
      createdAt,
    },
  });
}

async function makeRefund(customerId: string, transactionId: string, createdAt: Date) {
  return db.refund.create({
    data: {
      id: `ref_t_${randomUUID()}`,
      transactionId,
      customerId,
      amountCents: 2_000,
      reason: "other",
      status: "executed",
      requiresApproval: false,
      idempotencyKey: `refund:${transactionId}`,
      requestedById: "usr_test",
      requestedByName: "Test Requester",
      createdAt,
    },
  });
}

async function makeDispute(customerId: string, transactionId: string, openedAt: Date) {
  return db.dispute.create({
    data: {
      id: `dsp_t_${randomUUID()}`,
      transactionId,
      customerId,
      customerEmail: "test.customer@example.com",
      amountCents: 7_500,
      merchant: "Test Merchant",
      cardLast4: "4242",
      network: "visa",
      reasonCode: "fraud",
      status: "open",
      openedAt,
      respondBy: new Date(openedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}

const support = makeUser({ name: "Maria Lopez", roles: ["support_agent"] }); // refunds only, sees PII
const ops = makeUser({ name: "Olivia Chen", roles: ["ops_analyst"] }); // chargebacks only, sees PII
const auditor = makeUser({ name: "Alex Kim", roles: ["auditor"] }); // both tools, PII masked
const compliance = makeUser({ name: "Chris Novak", roles: ["compliance_officer"] }); // both tools, sees PII

describe("customer panels", () => {
  it("only include tools the user can read", () => {
    const fake = (tool: string): CustomerPanel => ({ tool, title: tool, render: async () => null });
    const panels = [fake("refunds"), fake("chargebacks"), fake("not-a-registered-tool")];
    expect(panelsForUser(support, panels).map((p) => p.tool)).toEqual(["refunds"]);
    expect(panelsForUser(ops, panels).map((p) => p.tool)).toEqual(["chargebacks"]);
    expect(panelsForUser(auditor, panels).map((p) => p.tool)).toEqual(["refunds", "chargebacks"]);
    expect(panelsForUser(makeUser({ roles: [] }), panels)).toEqual([]);
  });
});

describe("customer profile", () => {
  it("masks PII for users without pii:read", async () => {
    const c = await makeCustomer({ email: "jordan.lee@example.com" });
    const masked = await getCustomer(auditor, c.id);
    expect(masked?.email).not.toContain("jordan.lee");
    expect(masked?.email).toContain("•••");
    expect(masked?.phone).not.toBe(c.phone);
    const visible = await getCustomer(compliance, c.id);
    expect(visible?.email).toBe("jordan.lee@example.com");
  });

  it("records an audit event every time a customer is viewed", async () => {
    const c = await makeCustomer();
    await recordCustomerView(support, c.id);
    const events = await db.auditEvent.findMany({ where: { entityType: "Customer", entityId: c.id, action: "customer.view" } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorId: support.id, tool: "platform" });
  });
});

describe("global search", () => {
  it("never returns records from tools the user can't read", async () => {
    const c = await makeCustomer();
    const txn = await makeTxn(c.id, new Date("2026-02-01T00:00:00Z"));
    const refund = await makeRefund(c.id, txn.id, new Date("2026-02-02T00:00:00Z"));
    const dispute = await makeDispute(c.id, txn.id, new Date("2026-02-03T00:00:00Z"));

    expect((await searchCustomers(ops, refund.id)).results).toEqual([]);
    expect((await searchCustomers(support, refund.id)).results.map((r) => r.title)).toEqual([refund.id]);
    expect((await searchCustomers(support, dispute.id)).results).toEqual([]);
    const forOps = (await searchCustomers(ops, dispute.id)).results;
    expect(forOps.map((r) => r.title)).toEqual([dispute.id]);
    expect(forOps[0].customerId).toBe(c.id);
  });

  it("finds transactions and customers by ID for anyone with a tool", async () => {
    const c = await makeCustomer();
    const txn = await makeTxn(c.id, new Date("2026-02-01T00:00:00Z"));
    expect((await searchCustomers(auditor, txn.id)).results[0]).toMatchObject({ type: "Transaction", customerId: c.id });
    const byCustomer = (await searchCustomers(auditor, c.id)).results;
    expect(byCustomer[0]).toMatchObject({ type: "Customer", href: `/customers/${c.id}` });
    expect(byCustomer[0].subtitle).toContain("•••");
  });

  it("blocks email search without pii:read", async () => {
    const email = `search.${randomUUID().slice(0, 8)}@example.com`;
    const c = await makeCustomer({ email });
    const blocked = await searchCustomers(auditor, email);
    expect(blocked).toEqual({ results: [], piiSearchBlocked: true });
    const allowed = await searchCustomers(compliance, email);
    expect(allowed.piiSearchBlocked).toBe(false);
    expect(allowed.results.map((r) => r.customerId)).toEqual([c.id]);
  });

  it("returns nothing for users with no tools, or queries under 3 characters", async () => {
    const c = await makeCustomer();
    expect((await searchCustomers(makeUser({ roles: [] }), c.id)).results).toEqual([]);
    expect((await searchCustomers(compliance, "cu")).results).toEqual([]);
  });
});

describe("activity timeline", () => {
  it("merges sources newest first, pages on the server and respects tool access", async () => {
    const c = await makeCustomer();
    const t1 = await makeTxn(c.id, new Date("2026-03-01T00:00:00Z"));
    await makeTxn(c.id, new Date("2026-03-03T00:00:00Z"));
    await makeTxn(c.id, new Date("2026-03-05T00:00:00Z"));
    await makeRefund(c.id, t1.id, new Date("2026-03-04T00:00:00Z"));
    await makeDispute(c.id, t1.id, new Date("2026-03-02T00:00:00Z"));

    const page1 = await getCustomerTimeline(auditor, c.id, 1, 2);
    expect(page1.total).toBe(5);
    expect(page1.items.map((i) => i.at.toISOString().slice(0, 10))).toEqual(["2026-03-05", "2026-03-04"]);
    const page2 = await getCustomerTimeline(auditor, c.id, 2, 2);
    expect(page2.items.map((i) => i.tool)).toEqual(["platform", "chargebacks"]);
    const page3 = await getCustomerTimeline(auditor, c.id, 3, 2);
    expect(page3.items).toHaveLength(1);

    // Support can't read chargebacks, so the dispute isn't in their timeline.
    const forSupport = await getCustomerTimeline(support, c.id, 1, 10);
    expect(forSupport.items.some((i) => i.tool === "chargebacks")).toBe(false);
    expect(forSupport.total).toBe(4);
  });

  it("shows what happened to a record after it was created, in plain words", async () => {
    const c = await makeCustomer();
    const t = await makeTxn(c.id, new Date("2026-04-01T00:00:00Z"));
    const refund = await makeRefund(c.id, t.id, new Date("2026-04-02T00:00:00Z"));
    const audit = (action: string, before: unknown, after: unknown, at: string) =>
      db.auditEvent.create({
        data: {
          actorId: "usr_test",
          actorName: "Dan Weber",
          actorRoles: "[]",
          tool: "refunds",
          action,
          entityType: "Refund",
          entityId: refund.id,
          before: before === null ? null : JSON.stringify(before),
          after: JSON.stringify(after),
          createdAt: new Date(at),
        },
      });
    await audit("refund.request", null, { status: "pending_approval" }, "2026-04-02T00:00:00Z");
    await audit("refund.retry", { status: "failed" }, { status: "executed" }, "2026-04-03T00:00:00Z");

    const { items } = await getCustomerTimeline(support, c.id, 1, 10);
    const fromAudit = items.filter((i) => i.id.startsWith("audit:"));
    // The creation event duplicates the refund's own row, so it's left out.
    expect(fromAudit).toHaveLength(1);
    expect(fromAudit[0]).toMatchObject({ kind: "Refund retried", title: `Refund ${refund.id} · by Dan Weber`, href: `/tools/refunds/${refund.id}` });
    expect(items.some((i) => i.kind.includes("Activity") || i.title.includes("refund.request"))).toBe(false);
  });

  it("includes customer views only for users who can read the audit log", async () => {
    const c = await makeCustomer();
    await recordCustomerView(support, c.id);
    expect((await getCustomerTimeline(auditor, c.id)).items.some((i) => i.kind === "Customer viewed")).toBe(true);
    expect((await getCustomerTimeline(support, c.id)).items).toEqual([]);
  });
});
