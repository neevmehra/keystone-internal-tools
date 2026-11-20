import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { approve, reject, requestApproval } from "@/platform/approvals";
import { db } from "@/platform/db";
import { deliverPendingNotifications, markRead, notificationsForUser, safeNotify } from "@/platform/notifications";
import type { Role } from "@/platform/rbac/permissions";
import { makeUser } from "@/test/fixtures";

/** A user row in the DB, so notify() can find them by permission. */
async function dbUser(name: string, roles: Role[]) {
  const user = await db.user.create({
    data: { subject: `test|${randomUUID()}`, email: `${randomUUID()}@example.com`, name, groups: "[]", roles: JSON.stringify(roles) },
  });
  return { ...makeUser({ name, roles }), id: user.id };
}

const tool = `notify_test_${Math.random().toString(36).slice(2, 8)}`;
const newRequest = (by: ReturnType<typeof makeUser>) =>
  requestApproval(by, {
    tool,
    actionType: "test.payout",
    entityType: "Payout",
    entityId: `po_${randomUUID()}`,
    payload: {},
    amountCents: 75_000,
    approvePermission: "requests:approve",
  });

const inApp = (userId: string, kind: string) =>
  db.notification.findMany({ where: { channel: "in_app", userId, kind }, orderBy: { createdAt: "asc" } });

afterEach(() => {
  delete process.env.SLACK_WEBHOOK_URL;
  vi.unstubAllGlobals();
});

describe("notifications", () => {
  it("notifies everyone who can decide when an approval is requested, never the requester", async () => {
    const requester = await dbUser("Req", ["admin"]);
    const decider = await dbUser("Dec", ["admin"]);
    const bystander = await dbUser("Bystander", ["support_agent"]);
    const req = await newRequest(requester);

    const forDecider = await inApp(decider.id, "approval.requested");
    expect(forDecider.some((n) => n.title.includes("Approval needed") && n.href === "/approvals")).toBe(true);
    expect(await inApp(requester.id, "approval.requested")).toHaveLength(0);
    expect(await inApp(bystander.id, "approval.requested")).toHaveLength(0);
    expect(req.status).toBe("pending");
  });

  it("notifies the requester when their request is decided", async () => {
    const requester = await dbUser("Req2", ["admin"]);
    const decider = await dbUser("Dec2", ["admin"]);
    const a = await newRequest(requester);
    const b = await newRequest(requester);
    await approve(decider, a.id, { reason: "ok" });
    await reject(decider, b.id, { reason: "Duplicate payout" });

    const decided = await inApp(requester.id, "approval.decided");
    expect(decided.map((n) => n.title.split(":")[0]).sort()).toEqual(["Approved", "Rejected"]);
    expect(decided.find((n) => n.title.startsWith("Rejected"))?.body).toContain("Duplicate payout");
  });

  it("a Slack failure doesn't fail or roll back the approval", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.invalid/test";
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const requester = await dbUser("Req3", ["admin"]);
    const decider = await dbUser("Dec3", ["admin"]);
    const req = await newRequest(requester);
    const approved = await approve(decider, req.id, { reason: "fine" });

    expect(approved.status).toBe("approved");
    expect((await db.approvalRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("approved");
    expect(fetchMock).toHaveBeenCalled();
    const slack = await db.notification.findMany({ where: { channel: "slack", title: { contains: "75" } }, orderBy: { createdAt: "desc" }, take: 2 });
    expect(slack.length).toBeGreaterThan(0);
    expect(slack.every((n) => n.deliveryStatus === "failed" && n.deliveryError?.includes("network down"))).toBe(true);
    // In-app notifications still landed.
    expect(await inApp(requester.id, "approval.decided")).toHaveLength(1);
  });

  it("delivers Slack messages after commit and marks them sent", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.invalid/test";
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const requester = await dbUser("Req4", ["admin"]);
    await newRequest(requester);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { text: string };
    expect(body.text).toContain("Approval needed");
    expect(await deliverPendingNotifications()).toEqual({ sent: 0, failed: 0 }); // nothing left pending
  });

  it("a notification failure inside a transaction doesn't roll back the action", async () => {
    const entityId = `po_${randomUUID()}`;
    await db.$transaction(async (tx) => {
      await tx.approvalRequest.create({
        data: {
          tool,
          actionType: "test.payout",
          entityType: "Payout",
          entityId,
          payload: "{}",
          status: "pending",
          requestedById: "usr_x",
          requestedByName: "X",
          approvePermission: "requests:approve",
          idempotencyKey: `k_${randomUUID()}`,
        },
      });
      const n = await safeNotify(tx, async () => {
        throw new Error("boom");
      });
      expect(n).toBe(0);
    });
    expect(await db.approvalRequest.count({ where: { entityId } })).toBe(1);
  });

  it("lists a user's notifications and marks only their own as read", async () => {
    const requester = await dbUser("Req5", ["admin"]);
    const decider = await dbUser("Dec5", ["admin"]);
    await newRequest(requester);
    const before = await notificationsForUser(decider.id);
    expect(before.unread).toBeGreaterThan(0);
    await markRead(requester.id); // someone else's mark-all must not touch decider's rows
    expect((await notificationsForUser(decider.id)).unread).toBe(before.unread);
    await markRead(decider.id);
    expect((await notificationsForUser(decider.id)).unread).toBe(0);
  });
});
