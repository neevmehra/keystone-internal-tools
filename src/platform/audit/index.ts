/**
 * Append-only audit log. This module only inserts and reads: there is no
 * update or delete path, and none may be added. Production: revoke UPDATE
 * and DELETE on "AuditEvent" for the app's database role.
 */
import type { AuditEvent, Prisma } from "@prisma/client";
import { db, type Tx } from "@/platform/db";
import { fromJson, toJson } from "@/platform/json";

export type AuditActor = { id: string; name: string; roles: readonly string[] };

export type AuditInput = {
  actor: AuditActor;
  tool: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
};

export type AuditEventView = Omit<AuditEvent, "actorRoles" | "before" | "after"> & {
  actorRoles: string[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export type FieldChange = { field: string; before: unknown; after: unknown };

/** Insert one audit event. Takes a transaction so it commits with the change. */
export async function recordAudit(tx: Tx, input: AuditInput): Promise<AuditEvent> {
  if (!input.entityId) throw new Error("Audit events need an entityId.");
  return tx.auditEvent.create({
    data: {
      actorId: input.actor.id,
      actorName: input.actor.name,
      actorRoles: JSON.stringify(input.actor.roles),
      tool: input.tool,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: toJson(input.before),
      after: toJson(input.after),
      requestId: input.requestId ?? null,
    },
  });
}

export function toAuditView(event: AuditEvent): AuditEventView {
  return {
    ...event,
    actorRoles: fromJson<string[]>(event.actorRoles, []),
    before: fromJson<Record<string, unknown> | null>(event.before, null),
    after: fromJson<Record<string, unknown> | null>(event.after, null),
  };
}

export type AuditFilters = {
  tool?: string;
  action?: string;
  actor?: string;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
};

export const AUDIT_SORTABLE = ["createdAt", "tool", "action", "actorName", "entityType"] as const;
export type AuditSort = (typeof AUDIT_SORTABLE)[number];

function whereFor(f: AuditFilters): Prisma.AuditEventWhereInput {
  return {
    ...(f.tool && { tool: f.tool }),
    ...(f.action && { action: { contains: f.action } }),
    ...(f.actor && { actorName: { contains: f.actor } }),
    ...(f.entityType && { entityType: f.entityType }),
    ...(f.entityId && { entityId: f.entityId }),
    ...((f.from || f.to) && { createdAt: { ...(f.from && { gte: f.from }), ...(f.to && { lte: f.to }) } }),
  };
}

export async function listAuditEvents(opts: {
  filters?: AuditFilters;
  sort?: AuditSort;
  dir?: "asc" | "desc";
  skip?: number;
  take?: number;
}): Promise<{ rows: AuditEventView[]; total: number }> {
  const where = whereFor(opts.filters ?? {});
  const [rows, total] = await Promise.all([
    db.auditEvent.findMany({
      where,
      orderBy: [{ [opts.sort ?? "createdAt"]: opts.dir ?? "desc" }, { id: "desc" }],
      skip: opts.skip ?? 0,
      take: Math.min(opts.take ?? 50, 1000),
    }),
    db.auditEvent.count({ where }),
  ]);
  return { rows: rows.map(toAuditView), total };
}

/** Batched iterator for exports, so large logs never load at once. */
export async function* iterateAuditEvents(filters: AuditFilters = {}, batchSize = 500) {
  const where = whereFor(filters);
  let cursor: string | undefined;
  for (;;) {
    const batch = await db.auditEvent.findMany({
      where,
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });
    for (const e of batch) yield toAuditView(e);
    if (batch.length < batchSize) return;
    cursor = batch[batch.length - 1].id;
  }
}

export async function getEntityHistory(entityType: string, entityId: string): Promise<AuditEventView[]> {
  const rows = await db.auditEvent.findMany({
    where: { entityType, entityId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
  });
  return rows.map(toAuditView);
}

export async function getAuditFacets(): Promise<{ tools: string[]; entityTypes: string[] }> {
  const [tools, entityTypes] = await Promise.all([
    db.auditEvent.findMany({ distinct: ["tool"], select: { tool: true }, orderBy: { tool: "asc" } }),
    db.auditEvent.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
  ]);
  return { tools: tools.map((t) => t.tool), entityTypes: entityTypes.map((t) => t.entityType) };
}

/** Field-level before/after diff for one event. */
export function diffAudit(before: Record<string, unknown> | null, after: Record<string, unknown> | null): FieldChange[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changes: FieldChange[] = [];
  for (const field of [...keys].sort()) {
    const b = before?.[field];
    const a = after?.[field];
    if (JSON.stringify(b) !== JSON.stringify(a)) changes.push({ field, before: b, after: a });
  }
  return changes;
}
