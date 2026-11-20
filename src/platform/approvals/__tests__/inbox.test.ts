import { describe, expect, it } from "vitest";
import { approve, requestApproval } from "@/platform/approvals";
import { listInbox, topPendingForUser } from "@/platform/approvals/inbox";
import { PermissionDeniedError } from "@/platform/errors";
import { makeUser } from "@/test/fixtures";

// admin holds approvals:view and requests:approve; support_agent holds neither.
const requester = makeUser({ name: "Requester Admin", roles: ["admin"] });
const decider = makeUser({ name: "Decider Admin", roles: ["admin"] });
const support = makeUser({ name: "Support Agent", roles: ["support_agent"] });

const tool = `inbox_test_${Math.random().toString(36).slice(2, 8)}`;
const newRequest = (by = requester) =>
  requestApproval(by, {
    tool,
    actionType: "test.payout",
    entityType: "Payout",
    entityId: `po_${Math.random().toString(36).slice(2)}`,
    payload: {},
    amountCents: 50_000,
    approvePermission: "requests:approve",
  });

describe("approvals inbox", () => {
  it("blocks users without approvals:view", async () => {
    await expect(listInbox(support, { tab: "pending" })).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(await topPendingForUser(support)).toEqual([]);
  });

  it("never offers decide buttons on your own request", async () => {
    const req = await newRequest();
    const mine = (await listInbox(requester, { tab: "pending", tool, take: 100 })).rows.find((r) => r.id === req.id);
    expect(mine).toMatchObject({ isOwn: true, canDecide: false });

    const theirs = (await listInbox(decider, { tab: "pending", tool, take: 100 })).rows.find((r) => r.id === req.id);
    expect(theirs).toMatchObject({ isOwn: false, canDecide: true });

    // Your own request is never in your "waiting on you" list.
    expect((await topPendingForUser(requester, 100)).some((r) => r.id === req.id)).toBe(false);
    expect((await topPendingForUser(decider, 100)).some((r) => r.id === req.id)).toBe(true);
  });

  it("shows decided requests in the decider's Decided tab, without buttons", async () => {
    const req = await newRequest();
    await approve(decider, req.id, { reason: "Checked against the invoice" });
    const decided = (await listInbox(decider, { tab: "decided", tool, take: 100 })).rows.find((r) => r.id === req.id);
    expect(decided).toMatchObject({ status: "approved", reason: "Checked against the invoice", canDecide: false });
    const pending = await listInbox(decider, { tab: "pending", tool, take: 100 });
    expect(pending.rows.some((r) => r.id === req.id)).toBe(false);
  });

  it("hides pending requests the user has no permission to decide", async () => {
    const auditor = makeUser({ name: "Auditor", roles: ["compliance_officer"] }); // approvals:view, no requests:approve
    const req = await newRequest();
    const rows = (await listInbox(auditor, { tab: "pending", tool, take: 100 })).rows;
    expect(rows.some((r) => r.id === req.id)).toBe(false);
  });
});
