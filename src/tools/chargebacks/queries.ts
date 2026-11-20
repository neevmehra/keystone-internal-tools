import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/platform/auth";
import { db } from "@/platform/db";
import { maskRecord } from "@/platform/rbac";
import type { TableParams } from "@/platform/ui/table-params";
import { manifest } from "./manifest";
import { ACTIVE_STATUSES, DAY_MS, DISPUTE_STATUSES, LOSS_STATUSES, REASON_CODES, startOfMonthUtc, winRate } from "./rules";

export const SORTABLE = ["respondBy", "amountCents", "openedAt", "status", "resolvedAt"] as const;
export const FILTERS = ["status", "reason", "assigned", "q"] as const;

/** "active" (open + in progress) is the default view; "all" shows everything. */
export const STATUS_FILTER_DEFAULT = "active";

export function buildWhere(user: CurrentUser, filters: Record<string, string>): Prisma.DisputeWhereInput {
  const status = filters.status ?? STATUS_FILTER_DEFAULT;
  const where: Prisma.DisputeWhereInput = {};
  if (status === "active") where.status = { in: [...ACTIVE_STATUSES] };
  else if ((DISPUTE_STATUSES as readonly string[]).includes(status)) where.status = status;
  if (filters.reason && (REASON_CODES as readonly string[]).includes(filters.reason)) where.reasonCode = filters.reason;
  if (filters.assigned === "me") where.assignedToId = user.id;
  if (filters.assigned === "unassigned") where.assignedToId = null;
  if (filters.q) where.OR = [{ id: { contains: filters.q } }, { transactionId: { contains: filters.q } }];
  return where;
}

/** Reads only. Records are masked on the server before they reach the browser. */
export async function listDisputes(user: CurrentUser, p: TableParams<(typeof SORTABLE)[number]>) {
  const where = buildWhere(user, p.filters);
  const [rows, total] = await Promise.all([
    db.dispute.findMany({ where, orderBy: [{ [p.sort]: p.dir }, { id: "asc" }], skip: p.skip, take: p.take }),
    db.dispute.count({ where }),
  ]);
  return { rows: rows.map((r) => maskRecord(r, manifest.piiFields, user)), total };
}

export async function getDispute(user: CurrentUser, id: string) {
  const row = await db.dispute.findUnique({ where: { id } });
  return row && maskRecord(row, manifest.piiFields, user);
}

/** The numbers the team watches: open, due this week, win rate, lost this month. */
export async function getDisputeStats(now = new Date()) {
  const active = { status: { in: [...ACTIVE_STATUSES] } };
  const losses = { status: { in: [...LOSS_STATUSES] } };
  const last90 = { resolvedAt: { gte: new Date(now.getTime() - 90 * DAY_MS) } };
  const [open, unassigned, dueThisWeek, overdue, won90, lost90, lostThisMonth, pendingWriteOffs] = await Promise.all([
    db.dispute.count({ where: active }),
    db.dispute.count({ where: { status: "open" } }),
    db.dispute.count({ where: { ...active, respondBy: { gte: now, lte: new Date(now.getTime() + 7 * DAY_MS) } } }),
    db.dispute.count({ where: { ...active, respondBy: { lt: now } } }),
    db.dispute.count({ where: { status: "won", ...last90 } }),
    db.dispute.count({ where: { ...losses, ...last90 } }),
    db.dispute.aggregate({ where: { ...losses, resolvedAt: { gte: startOfMonthUtc(now) } }, _sum: { amountCents: true }, _count: true }),
    db.dispute.count({ where: { status: "lost" } }),
  ]);
  return {
    open,
    unassigned,
    dueThisWeek,
    overdue,
    winRate: winRate({ won: won90, lost: lost90 }),
    resolved90: won90 + lost90,
    lostThisMonthCents: lostThisMonth._sum.amountCents ?? 0,
    lostThisMonthCount: lostThisMonth._count,
    pendingWriteOffs,
  };
}

export async function getTransaction(id: string) {
  return db.cardTransaction.findUnique({ where: { id }, select: { id: true, merchant: true, category: true, createdAt: true, amountCents: true, status: true } });
}
