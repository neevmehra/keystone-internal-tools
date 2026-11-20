import { randomUUID } from "node:crypto";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { db } from "@/platform/db";
import { EVIDENCE_FILES, buildEvidencePack, parseEvidenceRange } from "@/platform/evidence";
import { makeUser } from "@/test/fixtures";

const parseCsv = (text: string) => {
  const [header, ...rows] = text.trim().split("\n");
  const cols = header.split(",");
  return rows.map((r) => Object.fromEntries(r.split(",").map((v, i) => [cols[i], v])));
};

describe("evidence pack", () => {
  const auditor = makeUser({ name: "Auditor", roles: ["auditor"] });
  const range = { from: new Date("2026-03-01T00:00:00Z"), to: new Date("2026-03-31T23:59:59.999Z") };

  it("parses ranges and defaults to the last 90 days", () => {
    const now = new Date("2026-06-30T12:00:00Z");
    const r = parseEvidenceRange(null, null, now);
    expect(r.to).toEqual(now);
    expect(Math.round((r.to.getTime() - r.from.getTime()) / 86_400_000)).toBe(90);
    expect(parseEvidenceRange("2026-01-01", "2026-01-31").from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("contains every file, matches the database, masks PII and is audited", async () => {
    const requester = `usr_${randomUUID()}`;
    const decider = `usr_${randomUUID()}`;
    const base = { tool: "evidence-test", actionType: "refund.execute", entityType: "Refund", payload: "{}", approvePermission: "x:approve", requestedById: requester, requestedByName: "Req" };
    await db.approvalRequest.createMany({
      data: [
        { ...base, entityId: "r1", amountCents: 25_000, status: "executed", decidedById: decider, decidedByName: "Dec", decidedAt: new Date("2026-03-03T10:00:00Z"), idempotencyKey: `k_${randomUUID()}`, createdAt: new Date("2026-03-02T10:00:00Z") },
        { ...base, entityId: "r2", amountCents: 9_000, status: "pending", idempotencyKey: `k_${randomUUID()}`, createdAt: new Date("2026-03-10T10:00:00Z") },
        { ...base, entityId: "r3", amountCents: 1_000, status: "pending", idempotencyKey: `k_${randomUUID()}`, createdAt: new Date("2026-05-10T10:00:00Z") },
      ],
    });
    const uid = `usr_${randomUUID()}`;
    await db.user.create({ data: { id: uid, subject: `test|${uid}`, email: "pat.employee@example.com", name: "Pat Employee", groups: "[]", roles: "[]" } });

    const { zip, files, fileName } = await buildEvidencePack(auditor, range);
    expect(fileName).toBe("keystone-evidence-2026-03-01-to-2026-03-31.zip");

    const unzipped = unzipSync(zip);
    expect(Object.keys(unzipped).sort()).toEqual([...EVIDENCE_FILES].sort());
    expect(strFromU8(unzipped["approvals.csv"])).toBe(files["approvals.csv"]);

    const inRange = await db.approvalRequest.findMany({ where: { createdAt: { gte: range.from, lte: range.to } } });
    const rows = parseCsv(files["approvals.csv"]);
    expect(rows.length).toBe(inRange.length);
    expect(rows.find((r) => r.entity_id === "r1")).toMatchObject({ requester_is_not_decider: "true", decided_by_id: decider });
    expect(rows.find((r) => r.entity_id === "r2")?.requester_is_not_decider).toBe("not_decided");
    expect(rows.some((r) => r.entity_id === "r3")).toBe(false);

    // Auditors don't hold pii:read: employee emails are masked.
    expect(files["users.csv"]).not.toContain("pat.employee@example.com");
    expect(files["users.csv"]).toContain("p•••@example.com");

    expect(files["README.txt"]).toContain("Separation of duties");
    expect(files["access-matrix.csv"].split("\n")[0]).toMatch(/^role,/);

    const exportEvent = await db.auditEvent.findFirst({ where: { action: "evidence.export", actorId: auditor.id } });
    expect(exportEvent).not.toBeNull();
    expect(JSON.parse(exportEvent!.after!)).toMatchObject({ from: "2026-03-01", to: "2026-03-31" });
  });
});
