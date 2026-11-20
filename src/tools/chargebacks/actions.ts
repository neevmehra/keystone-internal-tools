"use server";

import { z } from "zod";
import { defineAction } from "@/platform/actions";
import { registerExecutor, requestApproval, requiresApproval } from "@/platform/approvals";
import { recordAudit } from "@/platform/audit";
import type { CurrentUser } from "@/platform/auth/types";
import type { Tx } from "@/platform/db";
import { ConflictError, NotFoundError } from "@/platform/errors";
import { manifest } from "./manifest";
import { WRITE_OFF_ACTION, isActive } from "./rules";

// Every write in this tool is a defineAction export in this file, plus the
// write-off executor below (it runs inside the approvals engine's transaction).

const disputeId = z.string().min(1).max(64);

async function load(tx: Tx, id: string) {
  const dispute = await tx.dispute.findUnique({ where: { id } });
  if (!dispute) throw new NotFoundError("Dispute");
  return dispute;
}

/** The dispute must be picked up by this user and still being worked. */
async function loadOwned(tx: Tx, id: string, user: CurrentUser) {
  const dispute = await load(tx, id);
  if (dispute.status !== "in_progress") {
    throw new ConflictError(dispute.status === "open" ? "Pick up this dispute first." : "This dispute is already resolved.");
  }
  if (dispute.assignedToId !== user.id) {
    throw new ConflictError(`Only ${dispute.assignedToName ?? "the assignee"} can work this dispute. Ask them to hand it over.`);
  }
  return dispute;
}

export const pickUpDispute = defineAction({
  tool: manifest.slug,
  name: "chargebacks.dispute.pick_up",
  permission: "chargebacks:write",
  input: z.object({ disputeId }),
  run: async ({ input, user, tx }) => {
    const before = await load(tx, input.disputeId);
    if (!isActive(before.status)) throw new ConflictError("This dispute is already resolved.");
    if (before.assignedToId === user.id) throw new ConflictError("You already have this dispute.");
    if (before.assignedToId) throw new ConflictError(`${before.assignedToName ?? "Someone else"} is already working this dispute.`);
    // Conditional update so two people clicking at once can't both get it.
    const { count } = await tx.dispute.updateMany({
      where: { id: before.id, assignedToId: null, status: "open" },
      data: { status: "in_progress", assignedToId: user.id, assignedToName: user.name, assignedAt: new Date() },
    });
    if (count !== 1) throw new ConflictError("Someone else just picked up this dispute.");
    return {
      entityType: "Dispute",
      entityId: before.id,
      before: { status: before.status, assignedToName: before.assignedToName },
      after: { status: "in_progress", assignedToName: user.name },
      result: { id: before.id },
    };
  },
});

export const saveEvidenceNote = defineAction({
  tool: manifest.slug,
  name: "chargebacks.dispute.save_evidence",
  permission: "chargebacks:write",
  input: z.object({
    disputeId,
    evidenceNote: z.string().trim().min(5, "Describe the evidence you sent (at least a few words).").max(4000),
  }),
  run: async ({ input, user, tx }) => {
    const before = await loadOwned(tx, input.disputeId, user);
    const after = await tx.dispute.update({
      where: { id: before.id },
      data: { evidenceNote: input.evidenceNote, evidenceAt: new Date() },
    });
    return {
      entityType: "Dispute",
      entityId: before.id,
      before: { evidenceNote: before.evidenceNote },
      after: { evidenceNote: after.evidenceNote },
      result: { id: after.id },
    };
  },
});

export const markDisputeWon = defineAction({
  tool: manifest.slug,
  name: "chargebacks.dispute.mark_won",
  permission: "chargebacks:write",
  input: z.object({ disputeId }),
  run: async ({ input, user, tx }) => {
    const before = await loadOwned(tx, input.disputeId, user);
    if (!before.evidenceNote) throw new ConflictError("Add a note about the evidence you sent before resolving.");
    const after = await tx.dispute.update({ where: { id: before.id }, data: { status: "won", resolvedAt: new Date() } });
    return {
      entityType: "Dispute",
      entityId: before.id,
      before: { status: before.status },
      after: { status: after.status },
      result: { id: after.id, status: after.status },
    };
  },
});

/**
 * Losses at or under $500 are written off immediately. Larger losses stay
 * "lost" and create a write-off approval for finance (maker-checker).
 */
export const markDisputeLost = defineAction({
  tool: manifest.slug,
  name: "chargebacks.dispute.mark_lost",
  permission: "chargebacks:write",
  input: z.object({ disputeId }),
  run: async ({ input, user, tx }) => {
    const before = await loadOwned(tx, input.disputeId, user);
    if (!before.evidenceNote) throw new ConflictError("Add a note about the evidence you sent before resolving.");
    const now = new Date();

    if (requiresApproval(manifest, before.amountCents)) {
      await tx.dispute.update({ where: { id: before.id }, data: { status: "lost", resolvedAt: now } });
      const approval = await requestApproval(
        user,
        {
          tool: manifest.slug,
          actionType: WRITE_OFF_ACTION,
          entityType: "Dispute",
          entityId: before.id,
          payload: { disputeId: before.id },
          amountCents: before.amountCents,
          approvePermission: "chargebacks:approve",
          idempotencyKey: `${WRITE_OFF_ACTION}:${before.id}`,
          reason: `Lost dispute ${before.id} (${before.merchant}). Write-off needs finance sign-off.`,
        },
        tx,
      );
      return {
        entityType: "Dispute",
        entityId: before.id,
        before: { status: before.status },
        after: { status: "lost" },
        requestId: approval.id,
        result: { id: before.id, status: "lost" as const, approvalRequestId: approval.id },
      };
    }

    await tx.dispute.update({ where: { id: before.id }, data: { status: "written_off", resolvedAt: now, writtenOffAt: now } });
    return {
      entityType: "Dispute",
      entityId: before.id,
      before: { status: before.status },
      after: { status: "written_off" },
      result: { id: before.id, status: "written_off" as const, approvalRequestId: null },
    };
  },
});

// Write-off executor: runs once finance approves. There's no external call
// (the network already took the money); applying it marks the dispute
// written off and records that on the dispute's own history.
registerExecutor<{ disputeId: string }, { writtenOff: true }>(WRITE_OFF_ACTION, {
  run: async () => ({ writtenOff: true }),
  apply: async ({ tx, payload, request }) => {
    const before = await load(tx, payload.disputeId);
    if (before.status === "written_off") return;
    if (before.status !== "lost") throw new ConflictError(`Can't write off a dispute that is ${before.status}.`);
    const now = new Date();
    await tx.dispute.update({ where: { id: before.id }, data: { status: "written_off", writtenOffAt: now } });
    await recordAudit(tx, {
      actor: { id: request.decidedById ?? request.requestedById, name: request.decidedByName ?? "Approver", roles: [] },
      tool: manifest.slug,
      action: "chargebacks.dispute.write_off",
      entityType: "Dispute",
      entityId: before.id,
      before: { status: before.status },
      after: { status: "written_off" },
      requestId: request.id,
    });
  },
});
