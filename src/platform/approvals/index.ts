/**
 * Approvals engine (maker-checker). Rules:
 * 1. A requester can never approve or reject their own request.
 * 2. The decider needs the request's approvePermission.
 * 3. Thresholds are per-tool config (see requiresApproval).
 * 4. Execution runs a registered executor at most once per idempotencyKey;
 *    retrying a failure reuses the key.
 * 5. Every transition is audited, in the same transaction.
 */
import { randomUUID } from "node:crypto";
import type { ApprovalRequest } from "@prisma/client";
import { z } from "zod";
import { recordAudit, type AuditActor } from "@/platform/audit";
import { db, type Tx } from "@/platform/db";
import { ConflictError, NotFoundError, SelfApprovalError, ValidationError } from "@/platform/errors";
import { fromJson } from "@/platform/json";
import { hasPermission, requirePermission } from "@/platform/rbac";
import type { Permission } from "@/platform/rbac/permissions";

export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "executed", "failed"] as const;
export const approvalStatusSchema = z.enum(APPROVAL_STATUSES);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export type ApprovalUser = { id: string; name: string; roles: readonly string[]; permissions: readonly string[] };

export type ExecutorContext<P> = { request: ApprovalRequest; payload: P; idempotencyKey: string };

export type Executor<P = unknown, R = unknown> = {
  /** External side effect (e.g. a payments call). Must pass idempotencyKey through. */
  run: (ctx: ExecutorContext<P>) => Promise<R>;
  /** Optional local writes, committed with the "executed" transition and its audit event. */
  apply?: (ctx: ExecutorContext<P> & { tx: Tx; result: R }) => Promise<void>;
};

const executors = new Map<string, Executor<never, unknown>>();

export function registerExecutor<P, R>(actionType: string, executor: Executor<P, R>) {
  executors.set(actionType, executor as unknown as Executor<never, unknown>);
}

export function hasExecutor(actionType: string) {
  return executors.has(actionType);
}

/** Per-tool threshold check: amounts at or above the threshold need approval. */
export function requiresApproval(config: { approvalThresholdCents?: number }, amountCents: number) {
  return config.approvalThresholdCents !== undefined && amountCents >= config.approvalThresholdCents;
}

const actor = (u: ApprovalUser): AuditActor => ({ id: u.id, name: u.name, roles: u.roles });

const snapshot = (r: ApprovalRequest) => ({
  status: r.status,
  decidedById: r.decidedById,
  reason: r.reason,
  attempts: r.attempts,
  lastError: r.lastError,
});

async function audit(tx: Tx, user: ApprovalUser, action: string, before: ApprovalRequest | null, after: ApprovalRequest) {
  await recordAudit(tx, {
    actor: actor(user),
    tool: after.tool,
    action,
    entityType: "ApprovalRequest",
    entityId: after.id,
    before: before ? snapshot(before) : null,
    after: snapshot(after),
    requestId: after.id,
  });
}

function inTx<T>(tx: Tx | undefined, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return tx ? fn(tx) : db.$transaction(fn);
}

export const requestApprovalInput = z.object({
  tool: z.string().min(1),
  actionType: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  payload: z.unknown(),
  amountCents: z.number().int().nonnegative().optional(),
  approvePermission: z.string().min(1),
  idempotencyKey: z.string().min(8).optional(),
  reason: z.string().max(2000).optional(),
});

/** Create a pending request. Pass `tx` to commit it with the caller's action. */
export async function requestApproval(
  user: ApprovalUser,
  input: z.input<typeof requestApprovalInput> & { approvePermission: Permission | string },
  tx?: Tx,
): Promise<ApprovalRequest> {
  const parsed = requestApprovalInput.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid approval request.");
  const data = parsed.data;
  return inTx(tx, async (t) => {
    const created = await t.approvalRequest.create({
      data: {
        tool: data.tool,
        actionType: data.actionType,
        entityType: data.entityType,
        entityId: data.entityId,
        payload: JSON.stringify(data.payload ?? null),
        amountCents: data.amountCents ?? null,
        status: "pending",
        requestedById: user.id,
        requestedByName: user.name,
        reason: data.reason ?? null,
        approvePermission: data.approvePermission,
        idempotencyKey: data.idempotencyKey ?? `apr_${randomUUID()}`,
      },
    });
    await audit(t, user, "approval.request", null, created);
    return created;
  });
}

async function decide(user: ApprovalUser, requestId: string, to: "approved" | "rejected", reason?: string) {
  return db.$transaction(async (tx) => {
    const req = await tx.approvalRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundError("Approval request");
    if (req.requestedById === user.id) throw new SelfApprovalError(req.approvePermission);
    requirePermission(user, req.approvePermission);
    if (req.status !== "pending") throw new ConflictError(`Request is already ${req.status}.`);
    const { count } = await tx.approvalRequest.updateMany({
      where: { id: requestId, status: "pending" },
      data: { status: to, decidedById: user.id, decidedByName: user.name, decidedAt: new Date(), reason: reason ?? req.reason },
    });
    if (count !== 1) throw new ConflictError("Request was decided by someone else.");
    const updated = await tx.approvalRequest.findUniqueOrThrow({ where: { id: requestId } });
    await audit(tx, user, to === "approved" ? "approval.approve" : "approval.reject", req, updated);
    return updated;
  });
}

export function approve(user: ApprovalUser, requestId: string, opts: { reason?: string } = {}) {
  return decide(user, requestId, "approved", opts.reason);
}

export function reject(user: ApprovalUser, requestId: string, opts: { reason: string }) {
  if (!opts.reason?.trim()) throw new ValidationError("A reason is required to reject.");
  return decide(user, requestId, "rejected", opts.reason.trim());
}

export type ExecuteOutcome =
  | { status: "executed"; request: ApprovalRequest; result: unknown; alreadyExecuted: boolean }
  | { status: "failed"; request: ApprovalRequest; error: string };

/**
 * Run the registered executor for an approved (or previously failed) request.
 * At most once per idempotencyKey: an executed request returns its stored
 * result without calling the executor again.
 */
export async function execute(user: ApprovalUser, requestId: string): Promise<ExecuteOutcome> {
  const req = await db.approvalRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new NotFoundError("Approval request");
  requirePermission(user, req.approvePermission);
  if (req.status === "executed") {
    return { status: "executed", request: req, result: fromJson(req.result, null), alreadyExecuted: true };
  }
  if (req.status !== "approved" && req.status !== "failed") {
    throw new ConflictError(`Only approved requests can be executed (status: ${req.status}).`);
  }
  const executor = executors.get(req.actionType) as Executor<unknown, unknown> | undefined;
  if (!executor) throw new ConflictError(`No executor registered for "${req.actionType}".`);

  // Claim this attempt; a concurrent execute loses the race and gets a conflict.
  const { count } = await db.approvalRequest.updateMany({
    where: { id: requestId, status: req.status, attempts: req.attempts },
    data: { attempts: { increment: 1 } },
  });
  if (count !== 1) {
    const latest = await db.approvalRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (latest.status === "executed") {
      return { status: "executed", request: latest, result: fromJson(latest.result, null), alreadyExecuted: true };
    }
    throw new ConflictError("This request is already being executed.");
  }

  const ctx = { request: req, payload: fromJson<unknown>(req.payload, null), idempotencyKey: req.idempotencyKey };
  let result: unknown;
  try {
    result = await executor.run(ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Execution failed";
    const failed = await db.$transaction(async (tx) => {
      const updated = await tx.approvalRequest.update({
        where: { id: requestId },
        data: { status: "failed", lastError: message },
      });
      await audit(tx, user, "approval.fail", req, updated);
      return updated;
    });
    return { status: "failed", request: failed, error: message };
  }

  const executed = await db.$transaction(async (tx) => {
    await executor.apply?.({ ...ctx, tx, result });
    const updated = await tx.approvalRequest.update({
      where: { id: requestId },
      data: { status: "executed", result: JSON.stringify(result ?? null), lastError: null, executedAt: new Date() },
    });
    await audit(tx, user, "approval.execute", req, updated);
    return updated;
  });
  return { status: "executed", request: executed, result, alreadyExecuted: false };
}

export async function getApprovalsForEntity(entityType: string, entityId: string) {
  return db.approvalRequest.findMany({ where: { entityType, entityId }, orderBy: { createdAt: "desc" } });
}

/** Pending requests this user could decide (not their own). */
export async function countPendingForUser(user: ApprovalUser) {
  const perms = user.permissions.filter((p) => hasPermission(user, p));
  return db.approvalRequest.count({
    where: { status: "pending", approvePermission: { in: perms }, NOT: { requestedById: user.id } },
  });
}
