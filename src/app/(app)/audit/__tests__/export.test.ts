import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/(app)/audit/export/route";
import { getCurrentUser } from "@/platform/auth/current-user";
import { db } from "@/platform/db";
import { makeUser } from "@/test/fixtures";

vi.mock("@/platform/auth/current-user", () => ({ getCurrentUser: vi.fn() }));

describe("audit CSV export", () => {
  it("is forbidden without audit:export", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser({ roles: ["compliance_officer"] }));
    const res = await GET(new NextRequest("http://localhost/audit/export"));
    expect(res.status).toBe(403);
  });

  it("respects filters and records the export as an audit event", async () => {
    const auditor = makeUser({ name: "Alex", roles: ["auditor"] });
    vi.mocked(getCurrentUser).mockResolvedValue(auditor);
    const tool = `export-test-${randomUUID().slice(0, 8)}`;
    const base = { actorId: "a1", actorName: "Someone", actorRoles: "[]", action: "thing.update", entityType: "Thing" };
    await db.auditEvent.createMany({
      data: [
        { ...base, tool, entityId: "t1" },
        { ...base, tool, entityId: "t2" },
        { ...base, tool: "some-other-tool", entityId: "t3" },
      ],
    });

    const res = await GET(new NextRequest(`http://localhost/audit/export?tool=${tool}`));
    expect(res.status).toBe(200);
    const lines = (await res.text()).trim().split("\n");
    expect(lines[0]).toMatch(/^id,createdAt,actorId/);
    expect(lines.length - 1).toBe(2);
    expect(lines.slice(1).every((l) => l.includes(tool))).toBe(true);

    const logged = await db.auditEvent.findFirst({ where: { action: "audit.export", actorId: auditor.id }, orderBy: { createdAt: "desc" } });
    expect(logged).not.toBeNull();
    expect(JSON.parse(logged!.after!)).toMatchObject({ format: "csv", filters: { tool } });
  });
});
