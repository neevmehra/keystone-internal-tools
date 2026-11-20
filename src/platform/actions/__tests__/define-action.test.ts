import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineAction } from "@/platform/actions";
import * as audit from "@/platform/audit";
import { getCurrentUser } from "@/platform/auth/current-user";
import { db, type Tx } from "@/platform/db";
import { makeCustomer, makeUser } from "@/test/fixtures";

vi.mock("@/platform/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/platform/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/audit")>();
  return { ...actual, recordAudit: vi.fn(actual.recordAudit) };
});

const asUser = (user: Awaited<ReturnType<typeof getCurrentUser>>) => vi.mocked(getCurrentUser).mockResolvedValue(user);

let runTx: Tx | undefined;
const runSpy = vi.fn();

const setRiskTier = defineAction({
  tool: "test",
  name: "customer.set_risk_tier",
  permission: "requests:create",
  input: z.object({
    customerId: z.string(),
    riskTier: z.enum(["low", "medium", "high"]),
    failAt: z.enum(["run", "audit"]).optional(),
  }),
  run: async ({ input, tx }) => {
    runSpy();
    runTx = tx;
    const before = await tx.customer.findUniqueOrThrow({ where: { id: input.customerId } });
    const after = await tx.customer.update({ where: { id: input.customerId }, data: { riskTier: input.riskTier } });
    if (input.failAt === "run") throw new Error("boom after write");
    return {
      entityType: "Customer",
      entityId: input.failAt === "audit" ? "" : after.id,
      before: { riskTier: before.riskTier },
      after: { riskTier: after.riskTier },
      result: { id: after.id },
    };
  },
});

const auditCount = (entityId: string) => db.auditEvent.count({ where: { entityId } });
const tierOf = async (id: string) => (await db.customer.findUniqueOrThrow({ where: { id } })).riskTier;

describe("defineAction", () => {
  beforeEach(() => {
    runSpy.mockClear();
    vi.mocked(audit.recordAudit).mockClear();
    runTx = undefined;
  });

  it("blocks signed-out callers and writes nothing", async () => {
    const c = await makeCustomer();
    asUser(null);
    const res = await setRiskTier({ customerId: c.id, riskTier: "high" });
    expect(res).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
    expect(runSpy).not.toHaveBeenCalled();
    expect(await tierOf(c.id)).toBe("low");
    expect(await auditCount(c.id)).toBe(0);
  });

  it("blocks users without the permission and writes nothing", async () => {
    const c = await makeCustomer();
    asUser(makeUser({ roles: ["auditor"] }));
    const res = await setRiskTier({ customerId: c.id, riskTier: "high" });
    expect(res).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(runSpy).not.toHaveBeenCalled();
    expect(await tierOf(c.id)).toBe("low");
    expect(await auditCount(c.id)).toBe(0);
  });

  it("checks the permission before validating input", async () => {
    asUser(makeUser({ roles: ["auditor"] }));
    const res = await setRiskTier({ customerId: "x", riskTier: "nope" as "low" });
    expect(res).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("rejects invalid input and writes nothing", async () => {
    const c = await makeCustomer();
    asUser(makeUser({ roles: ["support_agent"] }));
    const res = await setRiskTier({ customerId: c.id, riskTier: "extreme" as "low" });
    expect(res).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(runSpy).not.toHaveBeenCalled();
    expect(await auditCount(c.id)).toBe(0);
  });

  it("writes the change and its audit event in the same transaction", async () => {
    const c = await makeCustomer();
    const user = makeUser({ name: "Maria Lopez", roles: ["support_agent"] });
    asUser(user);
    const res = await setRiskTier({ customerId: c.id, riskTier: "high" });
    expect(res.ok).toBe(true);
    expect(await tierOf(c.id)).toBe("high");

    expect(audit.recordAudit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audit.recordAudit).mock.calls[0][0]).toBe(runTx);

    const events = await db.auditEvent.findMany({ where: { entityId: c.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: user.id,
      actorName: "Maria Lopez",
      tool: "test",
      action: "customer.set_risk_tier",
      entityType: "Customer",
      before: JSON.stringify({ riskTier: "low" }),
      after: JSON.stringify({ riskTier: "high" }),
    });
    expect(res.ok && res.auditEventId).toBe(events[0].id);
  });

  it("rolls back both the change and the audit event when run throws", async () => {
    const c = await makeCustomer();
    asUser(makeUser({ roles: ["support_agent"] }));
    const res = await setRiskTier({ customerId: c.id, riskTier: "high", failAt: "run" });
    expect(res).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(await tierOf(c.id)).toBe("low");
    expect(await auditCount(c.id)).toBe(0);
  });

  it("rolls back the change when the audit write fails", async () => {
    const c = await makeCustomer();
    asUser(makeUser({ roles: ["support_agent"] }));
    const res = await setRiskTier({ customerId: c.id, riskTier: "high", failAt: "audit" });
    expect(res.ok).toBe(false);
    expect(audit.recordAudit).toHaveBeenCalledTimes(1);
    expect(await tierOf(c.id)).toBe("low");
    expect(await auditCount(c.id)).toBe(0);
  });
});
