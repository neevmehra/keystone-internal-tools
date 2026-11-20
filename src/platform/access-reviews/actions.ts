"use server";

import { z } from "zod";
import { defineAction } from "@/platform/actions";
import { ConflictError, NotFoundError, PermissionDeniedError, ValidationError } from "@/platform/errors";
import { snapshotUsers, summarize } from "./index";

/** Start a review: snapshot every user's access right now. One review runs at a time. */
export const startAccessReview = defineAction({
  tool: "platform",
  name: "access_review.start",
  permission: "access_reviews:manage",
  input: z.object({ name: z.string().trim().min(3, "Give the review a name").max(120) }),
  run: async ({ input, user, tx }) => {
    const open = await tx.accessReview.findFirst({ where: { status: "in_progress" } });
    if (open) throw new ConflictError(`"${open.name}" is still in progress. Complete it before starting another.`);
    const rows = await snapshotUsers(tx);
    const review = await tx.accessReview.create({
      data: { name: input.name, startedById: user.id, startedByName: user.name, items: { create: rows } },
    });
    const s = summarize(rows.map((r) => ({ decision: null, stale: r.stale })));
    return {
      entityType: "AccessReview",
      entityId: review.id,
      before: null,
      after: { name: review.name, status: review.status, users: s.total, stale: s.stale },
      result: { id: review.id },
    };
  },
});

/** Keep or revoke one user's access. Revoking needs a note; nobody reviews themselves. */
export const decideAccessReviewItem = defineAction({
  tool: "platform",
  name: "access_review.decide",
  permission: "access_reviews:manage",
  input: z
    .object({
      itemId: z.string().min(1),
      decision: z.enum(["keep", "revoke"]),
      note: z.string().trim().max(1000).optional(),
    })
    .refine((v) => v.decision !== "revoke" || !!v.note, { path: ["note"], message: "Say why access should be revoked" }),
  run: async ({ input, user, tx }) => {
    const item = await tx.accessReviewItem.findUnique({ where: { id: input.itemId }, include: { review: true } });
    if (!item) throw new NotFoundError("Review item");
    if (item.review.status !== "in_progress") throw new ConflictError("This review is completed and read-only.");
    if (item.userId === user.id) {
      throw new PermissionDeniedError("access_reviews:manage", "You can't review your own access. Ask another reviewer.");
    }
    const updated = await tx.accessReviewItem.update({
      where: { id: item.id },
      data: { decision: input.decision, note: input.note || null, decidedById: user.id, decidedByName: user.name, decidedAt: new Date() },
    });
    return {
      entityType: "AccessReviewItem",
      entityId: item.id,
      before: { reviewId: item.reviewId, user: item.userName, decision: item.decision, note: item.note },
      after: { reviewId: item.reviewId, user: item.userName, decision: updated.decision, note: updated.note },
      result: { id: updated.id, decision: updated.decision },
    };
  },
});

/** Complete a review. Every user needs a decision; afterwards the review is read-only. */
export const completeAccessReview = defineAction({
  tool: "platform",
  name: "access_review.complete",
  permission: "access_reviews:manage",
  input: z.object({ reviewId: z.string().min(1) }),
  run: async ({ input, user, tx }) => {
    const review = await tx.accessReview.findUnique({ where: { id: input.reviewId }, include: { items: true } });
    if (!review) throw new NotFoundError("Access review");
    if (review.status !== "in_progress") throw new ConflictError("This review is already completed.");
    const s = summarize(review.items);
    const open = s.total - s.decided;
    if (open > 0) throw new ValidationError(`${open} ${open === 1 ? "user still needs" : "users still need"} a decision.`);
    const { count } = await tx.accessReview.updateMany({
      where: { id: review.id, status: "in_progress" },
      data: { status: "completed", completedById: user.id, completedByName: user.name, completedAt: new Date() },
    });
    if (count !== 1) throw new ConflictError("This review was completed by someone else.");
    return {
      entityType: "AccessReview",
      entityId: review.id,
      before: { status: "in_progress" },
      after: { status: "completed", keep: s.keep, revoke: s.revoke },
      result: { id: review.id },
    };
  },
});
