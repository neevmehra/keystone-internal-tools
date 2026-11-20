import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/platform/db";
import {
  actionsPerDay,
  canViewInsights,
  decisionTimesByTool,
  formatDuration,
  getInsights,
  parseRange,
  pendingByAge,
  percentile,
  separationOfDuties,
} from "@/platform/insights";
import { makeUser } from "@/test/fixtures";

const H = 60 * 60 * 1000;
const now = new Date("2026-11-20T12:00:00Z");

describe("insights calculations", () => {
  it("computes median and p90", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([10, 20, 30, 40], 50)).toBe(25);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBeCloseTo(9.1);
  });

  it("groups decision times by tool, slowest p90 first", () => {
    const t0 = new Date("2026-11-01T00:00:00Z");
    const rows = [
      { tool: "refunds", createdAt: t0, decidedAt: new Date(t0.getTime() + 1 * H) },
      { tool: "refunds", createdAt: t0, decidedAt: new Date(t0.getTime() + 3 * H) },
      { tool: "chargebacks", createdAt: t0, decidedAt: new Date(t0.getTime() + 30 * H) },
      { tool: "chargebacks", createdAt: t0, decidedAt: null },
    ];
    const out = decisionTimesByTool(rows);
    expect(out.map((o) => o.tool)).toEqual(["chargebacks", "refunds"]);
    expect(out[1]).toMatchObject({ decided: 2, medianMs: 2 * H });
    expect(formatDuration(out[0].medianMs)).toBe("1.3d");
  });

  it("buckets pending approvals by age", () => {
    const ages = [1, 3.9, 5, 23, 25, 71, 73, 500];
    const buckets = pendingByAge(ages.map((h) => ({ createdAt: new Date(now.getTime() - h * H) })), now);
    expect(buckets.map((b) => b.count)).toEqual([2, 2, 2, 2]);
  });

  it("zero-fills actions per tool per day", () => {
    const from = new Date("2026-11-01T00:00:00Z");
    const to = new Date("2026-11-03T23:59:59Z");
    const series = actionsPerDay(
      [
        { tool: "refunds", createdAt: new Date("2026-11-01T10:00:00Z") },
        { tool: "refunds", createdAt: new Date("2026-11-01T11:00:00Z") },
        { tool: "chargebacks", createdAt: new Date("2026-11-03T09:00:00Z") },
      ],
      from,
      to,
    );
    expect(series.tools).toEqual(["chargebacks", "refunds"]);
    expect(series.points).toEqual([
      { date: "2026-11-01", chargebacks: 0, refunds: 2 },
      { date: "2026-11-02", chargebacks: 0, refunds: 0 },
      { date: "2026-11-03", chargebacks: 1, refunds: 0 },
    ]);
  });

  it("counts self-approvals from the data instead of assuming zero", () => {
    expect(separationOfDuties([])).toEqual({ decided: 0, selfDecided: 0 });
    expect(
      separationOfDuties([
        { requestedById: "a", decidedById: "b" },
        { requestedById: "a", decidedById: "a" },
        { requestedById: "c", decidedById: null },
      ]),
    ).toEqual({ decided: 2, selfDecided: 1 });
  });

  it("defaults to the last 30 days and caps ranges at 180 days", () => {
    const r = parseRange(undefined, undefined, now);
    expect(r.from.toISOString()).toBe("2026-10-22T00:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-11-20T23:59:59.999Z");
    const wide = parseRange("2020-01-01", "2026-11-20", now);
    expect(Math.round((wide.to.getTime() - wide.from.getTime()) / (24 * H))).toBe(180);
    expect(parseRange("nope", "2026-11-10", now).from.toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("is visible with approvals:view or admin:read only", () => {
    expect(canViewInsights(makeUser({ roles: ["finance_approver"] }))).toBe(true);
    expect(canViewInsights(makeUser({ roles: ["admin"] }))).toBe(true);
    expect(canViewInsights(makeUser({ roles: ["support_agent"] }))).toBe(false);
    expect(canViewInsights(null)).toBe(false);
  });
});

describe("getInsights", () => {
  it("computes separation of duties from the stored approvals", async () => {
    const range = { from: new Date(Date.now() - 24 * H), to: new Date(Date.now() + H) };
    const baseline = (await getInsights(range)).separation;
    const row = (requestedById: string, decidedById: string) => ({
      tool: "insights_test",
      actionType: "test.x",
      entityType: "X",
      entityId: randomUUID(),
      payload: "{}",
      status: "approved",
      requestedById,
      requestedByName: requestedById,
      decidedById,
      decidedByName: decidedById,
      decidedAt: new Date(),
      approvePermission: "requests:approve",
      idempotencyKey: `k_${randomUUID()}`,
    });
    // Test fixtures written directly: the engine itself would refuse a self-approval.
    await db.approvalRequest.createMany({ data: [row("u1", "u2"), row("u3", "u3")] });
    const after = (await getInsights(range)).separation;
    expect(after.decided - baseline.decided).toBe(2);
    expect(after.selfDecided - baseline.selfDecided).toBe(1);
  });
});
