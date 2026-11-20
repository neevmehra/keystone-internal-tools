import { beforeEach, describe, expect, it, vi } from "vitest";
import { approve, execute } from "@/platform/approvals";
import { getCurrentUser } from "@/platform/auth/current-user";
import type { CurrentUser } from "@/platform/auth/types";
import { db } from "@/platform/db";
import { SelfApprovalError } from "@/platform/errors";
import { makeDispute } from "@/test/chargebacks-fixtures";
import { makeUser } from "@/test/fixtures";
import { markDisputeLost, markDisputeWon, pickUpDispute, saveEvidenceNote } from "../actions";
import { manifest } from "../manifest";
import { buildWhere, getDispute } from "../queries";
import { DAY_MS, urgency, winRate } from "../rules";

vi.mock("@/platform/auth/current-user", () => ({ getCurrentUser: vi.fn() }));

const olivia = makeUser({ name: "Olivia", roles: ["ops_analyst"] });
const jordan = makeUser({ name: "Jordan", roles: ["ops_analyst"] });
const dan = makeUser({ name: "Dan", roles: ["finance_approver"] });
const actAs = (u: CurrentUser) => vi.mocked(getCurrentUser).mockResolvedValue(u);

const status = async (id: string) => (await db.dispute.findUniqueOrThrow({ where: { id } })).status;
const actionsFor = async (id: string) =>
  (await db.auditEvent.findMany({ where: { entityType: "Dispute", entityId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })).map((e) => e.action);

/** A dispute olivia has picked up and documented, ready to resolve. */
async function workedDispute(amountCents: number) {
  const d = await makeDispute({ amountCents });
  actAs(olivia);
  expect((await pickUpDispute({ disputeId: d.id })).ok).toBe(true);
  expect((await saveEvidenceNote({ disputeId: d.id, evidenceNote: "Sent signed proof of delivery." })).ok).toBe(true);
  return d;
}

describe("chargebacks", () => {
  beforeEach(() => vi.mocked(getCurrentUser).mockReset());

  it("lets one person pick up a dispute and blocks a second", async () => {
    const d = await makeDispute();
    actAs(olivia);
    expect(await pickUpDispute({ disputeId: d.id })).toMatchObject({ ok: true });
    const row = await db.dispute.findUniqueOrThrow({ where: { id: d.id } });
    expect(row).toMatchObject({ status: "in_progress", assignedToId: olivia.id, assignedToName: "Olivia" });

    actAs(jordan);
    expect(await pickUpDispute({ disputeId: d.id })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect((await db.dispute.findUniqueOrThrow({ where: { id: d.id } })).assignedToId).toBe(olivia.id);
    expect(await actionsFor(d.id)).toEqual(["chargebacks.dispute.pick_up"]);
  });

  it("only lets the assignee add evidence or resolve", async () => {
    const d = await workedDispute(10_000);
    actAs(jordan);
    expect(await saveEvidenceNote({ disputeId: d.id, evidenceNote: "Trying to sneak in a note." })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await markDisputeWon({ disputeId: d.id })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await status(d.id)).toBe("in_progress");
  });

  it("rejects invalid status transitions", async () => {
    const open = await makeDispute();
    actAs(olivia);
    // Can't resolve without picking up first.
    expect(await markDisputeWon({ disputeId: open.id })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await markDisputeLost({ disputeId: open.id })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });

    // Can't resolve without an evidence note.
    expect((await pickUpDispute({ disputeId: open.id })).ok).toBe(true);
    expect(await markDisputeWon({ disputeId: open.id })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });

    // Can't resolve twice or pick up a resolved dispute.
    const won = await workedDispute(10_000);
    expect((await markDisputeWon({ disputeId: won.id })).ok).toBe(true);
    expect(await markDisputeLost({ disputeId: won.id })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    actAs(jordan);
    expect(await pickUpDispute({ disputeId: won.id })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await status(won.id)).toBe("won");
  });

  it("validates the evidence note", async () => {
    const d = await workedDispute(10_000);
    expect(await saveEvidenceNote({ disputeId: d.id, evidenceNote: " " })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  });

  it("writes off losses of $500 or less immediately, with no approval", async () => {
    const d = await workedDispute(50_000);
    const res = await markDisputeLost({ disputeId: d.id });
    expect(res).toMatchObject({ ok: true, result: { status: "written_off", approvalRequestId: null } });
    const row = await db.dispute.findUniqueOrThrow({ where: { id: d.id } });
    expect(row.status).toBe("written_off");
    expect(row.writtenOffAt).not.toBeNull();
    expect(await db.approvalRequest.count({ where: { entityType: "Dispute", entityId: d.id } })).toBe(0);
  });

  it("sends losses over $500 to finance, blocks self-approval, and writes off exactly once", async () => {
    const d = await workedDispute(50_001);
    const res = await markDisputeLost({ disputeId: d.id });
    expect(res).toMatchObject({ ok: true, result: { status: "lost" } });
    expect(await status(d.id)).toBe("lost");

    const request = await db.approvalRequest.findFirstOrThrow({ where: { entityType: "Dispute", entityId: d.id } });
    expect(request).toMatchObject({ status: "pending", approvePermission: "chargebacks:approve", requestedById: olivia.id, amountCents: 50_001 });

    // The requester can't approve their own write-off, even with the permission.
    const oliviaWithApprove = { ...olivia, permissions: [...olivia.permissions, "chargebacks:approve" as const] };
    await expect(approve(oliviaWithApprove, request.id)).rejects.toBeInstanceOf(SelfApprovalError);
    expect(await status(d.id)).toBe("lost");

    await approve(dan, request.id);
    const first = await execute(dan, request.id);
    expect(first).toMatchObject({ status: "executed", alreadyExecuted: false });
    const second = await execute(dan, request.id);
    expect(second).toMatchObject({ status: "executed", alreadyExecuted: true });

    const row = await db.dispute.findUniqueOrThrow({ where: { id: d.id } });
    expect(row.status).toBe("written_off");
    expect(await actionsFor(d.id)).toEqual([
      "chargebacks.dispute.pick_up",
      "chargebacks.dispute.save_evidence",
      "chargebacks.dispute.mark_lost",
      "chargebacks.dispute.write_off",
    ]);
  });

  it("masks customer emails for auditors but not compliance or ops", async () => {
    const d = await makeDispute({ customerEmail: "dana.disputer@example.com" });
    expect((await getDispute(makeUser({ roles: ["auditor"] }), d.id))?.customerEmail).toBe("d•••@example.com");
    expect((await getDispute(makeUser({ roles: ["compliance_officer"] }), d.id))?.customerEmail).toBe("dana.disputer@example.com");
    expect((await getDispute(olivia, d.id))?.customerEmail).toBe("dana.disputer@example.com");
    expect(manifest.piiFields).toContain("customerEmail");
  });

  it("defaults the queue to open and in-progress disputes", () => {
    expect(buildWhere(olivia, {})).toEqual({ status: { in: ["open", "in_progress"] } });
    expect(buildWhere(olivia, { status: "all" })).toEqual({});
    expect(buildWhere(olivia, { status: "won", assigned: "me" })).toEqual({ status: "won", assignedToId: olivia.id });
    expect(buildWhere(olivia, { status: "bogus" })).toEqual({});
  });

  it("flags deadlines and computes win rate", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    const at = (days: number) => new Date(now.getTime() + days * DAY_MS);
    expect(urgency({ status: "open", respondBy: at(-0.5) }, now)).toBe("overdue");
    expect(urgency({ status: "in_progress", respondBy: at(1.5) }, now)).toBe("due_soon");
    expect(urgency({ status: "open", respondBy: at(2) }, now)).toBe("due_soon");
    expect(urgency({ status: "open", respondBy: at(5) }, now)).toBe("ok");
    expect(urgency({ status: "won", respondBy: at(-3) }, now)).toBe("none");
    expect(winRate({ won: 3, lost: 1 })).toBe(0.75);
    expect(winRate({ won: 0, lost: 0 })).toBeNull();
  });
});
