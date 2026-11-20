import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/platform/auth/current-user";
import { db } from "@/platform/db";
import { PERMISSIONS } from "@/platform/rbac/permissions";
import { makeDispute } from "@/test/chargebacks-fixtures";
import { makeUser } from "@/test/fixtures";
import { tools } from "@/tools";
import * as actions from "../actions";
import { manifest } from "../manifest";

vi.mock("@/platform/auth/current-user", () => ({ getCurrentUser: vi.fn() }));

describe("Chargebacks governance", () => {
  beforeEach(() => vi.mocked(getCurrentUser).mockReset());

  it("is registered with a valid manifest", () => {
    expect(tools).toContainEqual(manifest);
    expect(PERMISSIONS).toContain(manifest.readPermission);
    const sensitivity: string = manifest.sensitivity;
    if (sensitivity !== "internal") expect(manifest.piiFields?.length).toBeGreaterThan(0);
  });

  it("only exports defineAction actions scoped to this tool", () => {
    for (const action of Object.values(actions)) {
      expect(action.definition.tool).toBe(manifest.slug);
      expect(PERMISSIONS).toContain(action.definition.permission);
      expect(action.definition.permission.startsWith(`${manifest.slug}:`)).toBe(true);
    }
  });

  it("blocks users without permission and writes nothing", async () => {
    const dispute = await makeDispute();
    for (const roles of [["auditor"], ["compliance_officer"], ["finance_approver"], ["support_agent"], ["admin"]] as const) {
      vi.mocked(getCurrentUser).mockResolvedValue(makeUser({ roles: [...roles] }));
      const res = await actions.pickUpDispute({ disputeId: dispute.id });
      expect(res).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    }
    expect((await db.dispute.findUniqueOrThrow({ where: { id: dispute.id } })).status).toBe("open");
    expect(await db.auditEvent.count({ where: { entityId: dispute.id } })).toBe(0);
  });

  it("writes and audits with permission", async () => {
    const dispute = await makeDispute();
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser({ roles: ["ops_analyst"] }));
    const res = await actions.pickUpDispute({ disputeId: dispute.id });
    expect(res.ok).toBe(true);
    expect(await db.auditEvent.count({ where: { entityId: dispute.id, tool: manifest.slug } })).toBe(1);
  });
});
