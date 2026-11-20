import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/platform/auth/current-user";
import { db } from "@/platform/db";
import { PERMISSIONS } from "@/platform/rbac/permissions";
import { makeCustomer, makeUser } from "@/test/fixtures";
import { tools } from "@/tools";
import * as actions from "../actions";
import { manifest } from "../manifest";

vi.mock("@/platform/auth/current-user", () => ({ getCurrentUser: vi.fn() }));

describe("__TOOL_NAME__ governance", () => {
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
    const customer = await makeCustomer();
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser({ roles: ["admin"] }));
    const res = await actions.setRiskTier({ customerId: customer.id, riskTier: "high" });
    expect(res).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect((await db.customer.findUniqueOrThrow({ where: { id: customer.id } })).riskTier).toBe("low");
    expect(await db.auditEvent.count({ where: { entityId: customer.id } })).toBe(0);
  });

  it("writes and audits with permission", async () => {
    const customer = await makeCustomer();
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser({ permissions: ["__SLUG__:write"] }));
    const res = await actions.setRiskTier({ customerId: customer.id, riskTier: "high" });
    expect(res.ok).toBe(true);
    expect(await db.auditEvent.count({ where: { entityId: customer.id, tool: manifest.slug } })).toBe(1);
  });
});
