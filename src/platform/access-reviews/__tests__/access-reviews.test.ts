import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getAccessReview, isStale } from "@/platform/access-reviews";
import { completeAccessReview, decideAccessReviewItem, startAccessReview } from "@/platform/access-reviews/actions";
import { getCurrentUser } from "@/platform/auth/current-user";
import type { CurrentUser } from "@/platform/auth/types";
import { db } from "@/platform/db";
import { makeUser } from "@/test/fixtures";

vi.mock("@/platform/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
const asUser = (u: CurrentUser | null) => vi.mocked(getCurrentUser).mockResolvedValue(u);

const DAY = 24 * 60 * 60 * 1000;
const reviewer = makeUser({ name: "Reviewer", roles: ["compliance_officer"] });
const auditor = makeUser({ name: "Auditor", roles: ["auditor"] });

async function insertUser(u: { id?: string; name: string; lastLoginAt: Date | null }) {
  const id = u.id ?? `usr_${randomUUID()}`;
  return db.user.create({
    data: { id, subject: `test|${id}`, email: `${id}@example.com`, name: u.name, groups: '["support"]', roles: '["support_agent"]', lastLoginAt: u.lastLoginAt },
  });
}

describe("access reviews", () => {
  let reviewId = "";
  let staleUserId = "";

  beforeAll(async () => {
    await insertUser({ id: reviewer.id, name: "Reviewer", lastLoginAt: new Date() });
    staleUserId = (await insertUser({ name: "Stale Sam", lastLoginAt: new Date(Date.now() - 45 * DAY) })).id;
    await insertUser({ name: "Never Signed In", lastLoginAt: null });
  });

  it("flags accounts with no sign-in for 30+ days as stale", () => {
    expect(isStale(new Date(Date.now() - 31 * DAY))).toBe(true);
    expect(isStale(new Date(Date.now() - 2 * DAY))).toBe(false);
    expect(isStale(null)).toBe(true);
  });

  it("requires access_reviews:manage", async () => {
    asUser(auditor);
    const res = await startAccessReview({ name: "Not allowed" });
    expect(res).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("snapshots every user when a review starts, and audits it", async () => {
    asUser(reviewer);
    const res = await startAccessReview({ name: "Test access review" });
    if (!res.ok) throw new Error(res.error.message);
    reviewId = res.result.id;
    const review = await getAccessReview(reviewId);
    expect(review?.items.length).toBe(await db.user.count());
    expect(review?.items.find((i) => i.userId === staleUserId)?.stale).toBe(true);
    expect(await db.auditEvent.count({ where: { entityId: reviewId, action: "access_review.start" } })).toBe(1);
  });

  it("allows only one review in progress", async () => {
    asUser(reviewer);
    expect(await startAccessReview({ name: "Second review" })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });

  it("requires a note to revoke", async () => {
    asUser(reviewer);
    const item = await db.accessReviewItem.findFirstOrThrow({ where: { reviewId, userId: staleUserId } });
    expect(await decideAccessReviewItem({ itemId: item.id, decision: "revoke" })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  });

  it("never lets a reviewer decide their own access", async () => {
    asUser(reviewer);
    const own = await db.accessReviewItem.findFirstOrThrow({ where: { reviewId, userId: reviewer.id } });
    expect(await decideAccessReviewItem({ itemId: own.id, decision: "keep" })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect((await db.accessReviewItem.findUniqueOrThrow({ where: { id: own.id } })).decision).toBeNull();
  });

  it("can't complete while any user is undecided", async () => {
    asUser(reviewer);
    const item = await db.accessReviewItem.findFirstOrThrow({ where: { reviewId, userId: staleUserId } });
    const res = await decideAccessReviewItem({ itemId: item.id, decision: "revoke", note: "Left the company" });
    expect(res.ok).toBe(true);
    expect(await db.auditEvent.count({ where: { entityId: item.id, action: "access_review.decide" } })).toBe(1);

    const blocked = await completeAccessReview({ reviewId });
    expect(blocked).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect((await db.accessReview.findUniqueOrThrow({ where: { id: reviewId } })).status).toBe("in_progress");
  });

  it("completes once everyone is decided, then is read-only", async () => {
    const other = makeUser({ name: "Second Reviewer", roles: ["admin"] });
    const items = await db.accessReviewItem.findMany({ where: { reviewId, decision: null } });
    for (const i of items) {
      asUser(i.userId === reviewer.id ? other : reviewer);
      const res = await decideAccessReviewItem({ itemId: i.id, decision: "keep" });
      expect(res.ok).toBe(true);
    }
    asUser(reviewer);
    const done = await completeAccessReview({ reviewId });
    expect(done.ok).toBe(true);
    const review = await db.accessReview.findUniqueOrThrow({ where: { id: reviewId } });
    expect(review).toMatchObject({ status: "completed", completedById: reviewer.id });
    expect(await db.auditEvent.count({ where: { entityId: reviewId, action: "access_review.complete" } })).toBe(1);

    const item = await db.accessReviewItem.findFirstOrThrow({ where: { reviewId, userId: staleUserId } });
    expect(await decideAccessReviewItem({ itemId: item.id, decision: "keep" })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect((await db.accessReviewItem.findUniqueOrThrow({ where: { id: item.id } })).decision).toBe("revoke");
    expect(await completeAccessReview({ reviewId })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });
});
