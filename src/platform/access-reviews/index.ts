/**
 * Periodic user access reviews. Starting a review snapshots every user's
 * groups, roles and last sign-in. Reviewers mark each user keep or revoke;
 * nobody decides their own access. A review completes only when every user
 * has a decision, and is read-only afterwards. Writes live in ./actions.ts
 * (defineAction: permission check, validation, transaction, audit).
 */
import type { AccessReview, AccessReviewItem } from "@prisma/client";
import { db, type Tx } from "@/platform/db";
import { fromJson } from "@/platform/json";

export const STALE_AFTER_DAYS = 30;
export const DECISIONS = ["keep", "revoke"] as const;
export type Decision = (typeof DECISIONS)[number];
export type ReviewStatus = "in_progress" | "completed";

export type ReviewItemView = Omit<AccessReviewItem, "groups" | "roles"> & { groups: string[]; roles: string[] };
export type ReviewSummary = { total: number; decided: number; keep: number; revoke: number; stale: number };

export function isStale(lastLoginAt: Date | null, now = new Date()): boolean {
  if (!lastLoginAt) return true;
  return now.getTime() - lastLoginAt.getTime() >= STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

export function toItemView(item: AccessReviewItem): ReviewItemView {
  return { ...item, groups: fromJson<string[]>(item.groups, []), roles: fromJson<string[]>(item.roles, []) };
}

export function summarize(items: ReadonlyArray<Pick<AccessReviewItem, "decision" | "stale">>): ReviewSummary {
  return {
    total: items.length,
    decided: items.filter((i) => i.decision).length,
    keep: items.filter((i) => i.decision === "keep").length,
    revoke: items.filter((i) => i.decision === "revoke").length,
    stale: items.filter((i) => i.stale).length,
  };
}

/** Snapshot rows for a new review: every user, as they are right now. */
export async function snapshotUsers(tx: Tx, now = new Date()) {
  const users = await tx.user.findMany({ orderBy: { name: "asc" } });
  return users.map((u) => ({
    userId: u.id,
    userName: u.name,
    userEmail: u.email,
    groups: u.groups,
    roles: u.roles,
    lastLoginAt: u.lastLoginAt,
    stale: isStale(u.lastLoginAt, now),
  }));
}

export async function listAccessReviews(): Promise<Array<AccessReview & { summary: ReviewSummary }>> {
  const reviews = await db.accessReview.findMany({
    orderBy: { startedAt: "desc" },
    include: { items: { select: { decision: true, stale: true } } },
  });
  return reviews.map(({ items, ...r }) => ({ ...r, summary: summarize(items) }));
}

export async function getAccessReview(id: string) {
  const review = await db.accessReview.findUnique({ where: { id }, include: { items: true } });
  if (!review) return null;
  const items = review.items
    .map(toItemView)
    // Stale accounts first: they are the ones a reviewer most needs to look at.
    .sort((a, b) => Number(b.stale) - Number(a.stale) || a.userName.localeCompare(b.userName));
  return { ...review, items, summary: summarize(review.items) };
}

export async function latestCompletedReview() {
  const r = await db.accessReview.findFirst({ where: { status: "completed" }, orderBy: { completedAt: "desc" } });
  return r ? getAccessReview(r.id) : null;
}

/**
 * Access is managed in the identity provider, so a revoke decision becomes
 * "remove this person from these IdP groups".
 */
export function revocationList(items: readonly ReviewItemView[]) {
  return items.filter((i) => i.decision === "revoke").map((i) => ({ userName: i.userName, userEmail: i.userEmail, groups: i.groups, note: i.note }));
}
