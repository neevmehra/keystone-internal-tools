import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/platform/auth/current-user";
import { db } from "@/platform/db";
import { FakePaymentsClient } from "@/platform/integrations";
import { PERMISSIONS } from "@/platform/rbac/permissions";
import { makeTransaction, makeUser } from "@/test/fixtures";
import { tools } from "@/tools";
import * as actions from "../actions";
import { manifest } from "../manifest";

vi.mock("@/platform/auth/current-user", () => ({ getCurrentUser: vi.fn() }));

describe("Refunds governance", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockReset();
    (globalThis as { keystonePayments?: unknown }).keystonePayments = new FakePaymentsClient({ failRate: 0 });
  });

  it("is registered with a valid manifest", () => {
    expect(tools).toContainEqual(manifest);
    expect(PERMISSIONS).toContain(manifest.readPermission);
    expect(manifest.sensitivity).toBe("money");
    expect(manifest.piiFields).toEqual(["customerEmail"]);
  });

  it("only exports defineAction actions scoped to this tool", () => {
    for (const action of Object.values(actions)) {
      expect(action.definition.tool).toBe(manifest.slug);
      expect(PERMISSIONS).toContain(action.definition.permission);
      expect(action.definition.permission.startsWith(`${manifest.slug}:`)).toBe(true);
    }
  });

  it("blocks users without permission and writes nothing", async () => {
    const txn = await makeTransaction();
    for (const roles of [["auditor"], ["compliance_officer"], ["finance_approver"], ["admin"]] as const) {
      vi.mocked(getCurrentUser).mockResolvedValue(makeUser({ roles: [...roles] }));
      const res = await actions.requestRefund({ transactionId: txn.id, amountCents: 5_000, reason: "service_issue" });
      expect(res).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    }
    expect(await db.refund.count({ where: { transactionId: txn.id } })).toBe(0);
    expect(await db.auditEvent.count({ where: { tool: manifest.slug, after: { contains: txn.id } } })).toBe(0);
  });

  it("writes and audits with permission", async () => {
    const txn = await makeTransaction();
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser({ roles: ["support_agent"] }));
    const res = await actions.requestRefund({ transactionId: txn.id, amountCents: 5_000, reason: "service_issue" });
    expect(res.ok).toBe(true);
    const refund = await db.refund.findUniqueOrThrow({ where: { transactionId: txn.id } });
    expect(await db.auditEvent.count({ where: { entityType: "Refund", entityId: refund.id, tool: manifest.slug } })).toBe(1);
  });
});
