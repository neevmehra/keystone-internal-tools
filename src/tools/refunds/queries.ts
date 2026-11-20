import type { ApprovalRequest, Prisma, Refund } from "@prisma/client";
import type { CurrentUser } from "@/platform/auth";
import { db } from "@/platform/db";
import { hasPermission, maskRecord } from "@/platform/rbac";
import type { TableParams } from "@/platform/ui/table-params";
import { REFUNDABLE_TRANSACTION_STATUS, manifest, type RefundStatus } from "./manifest";

/** Reads only. Records are masked on the server before they reach the browser. */

export const SORTABLE = ["createdAt", "amountCents"] as const;
export const FILTERS = ["status", "reason", "min", "max", "from", "to", "q"] as const;

const APPROVAL_TO_REFUND_STATUS: Record<string, RefundStatus> = {
  pending: "pending_approval",
  approved: "approved",
  rejected: "rejected",
  executed: "executed",
  failed: "failed",
};
const REFUND_TO_APPROVAL_STATUS: Record<RefundStatus, string> = {
  pending_approval: "pending",
  approved: "approved",
  rejected: "rejected",
  executed: "executed",
  failed: "failed",
};

/**
 * A refund's status. While an approval request exists, the approvals engine
 * owns the lifecycle (pending, approved, rejected, executed, failed), so its
 * status wins. Refunds under the threshold carry their own status.
 */
export function effectiveStatus(refund: Pick<Refund, "status">, approval?: Pick<ApprovalRequest, "status"> | null): RefundStatus {
  if (approval) return APPROVAL_TO_REFUND_STATUS[approval.status] ?? "pending_approval";
  return refund.status as RefundStatus;
}

async function statusWhere(status: string): Promise<Prisma.RefundWhereInput> {
  const approvalStatus = REFUND_TO_APPROVAL_STATUS[status as RefundStatus];
  if (!approvalStatus) return { id: "__none__" };
  const viaApproval = await db.approvalRequest.findMany({
    where: { tool: manifest.slug, entityType: "Refund", status: approvalStatus },
    select: { entityId: true },
  });
  return {
    OR: [{ requiresApproval: false, status }, { id: { in: viaApproval.map((a) => a.entityId) } }],
  };
}

const dollarsToCents = (v: string | undefined) => {
  if (!v) return undefined;
  const n = Number(v.replace(/[$,]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
};

const parseDay = (v: string | undefined, endOfDay = false) => {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  return endOfDay ? new Date(d.getTime() + 24 * 60 * 60 * 1000) : d;
};

export async function buildWhere(filters: Record<string, string>): Promise<Prisma.RefundWhereInput> {
  const and: Prisma.RefundWhereInput[] = [];
  if (filters.status) and.push(await statusWhere(filters.status));
  if (filters.reason) and.push({ reason: filters.reason });
  const min = dollarsToCents(filters.min);
  const max = dollarsToCents(filters.max);
  if (min !== undefined || max !== undefined) and.push({ amountCents: { ...(min !== undefined && { gte: min }), ...(max !== undefined && { lte: max }) } });
  const from = parseDay(filters.from);
  const to = parseDay(filters.to, true);
  if (from || to) and.push({ createdAt: { ...(from && { gte: from }), ...(to && { lt: to }) } });
  if (filters.q) and.push({ OR: [{ id: { contains: filters.q } }, { transactionId: { contains: filters.q } }] });
  return and.length ? { AND: and } : {};
}

export type RefundRow = Refund & {
  effectiveStatus: RefundStatus;
  approval: ApprovalRequest | null;
  customerName: string | null;
  customerEmail: string | null;
};

async function hydrate(user: CurrentUser, refunds: Refund[]): Promise<RefundRow[]> {
  if (refunds.length === 0) return [];
  const [approvals, customers] = await Promise.all([
    db.approvalRequest.findMany({ where: { entityType: "Refund", entityId: { in: refunds.map((r) => r.id) } } }),
    db.customer.findMany({ where: { id: { in: [...new Set(refunds.map((r) => r.customerId))] } }, select: { id: true, name: true, email: true } }),
  ]);
  const approvalByRefund = new Map(approvals.map((a) => [a.entityId, a]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  return refunds.map((r) => {
    const approval = approvalByRefund.get(r.id) ?? null;
    const customer = customerById.get(r.customerId);
    const row: RefundRow = {
      ...r,
      approval,
      effectiveStatus: effectiveStatus(r, approval),
      customerName: customer?.name ?? null,
      customerEmail: customer?.email ?? null,
    };
    return maskRecord(row, manifest.piiFields, user);
  });
}

export async function listRefunds(user: CurrentUser, p: TableParams<(typeof SORTABLE)[number]>) {
  const where = await buildWhere(p.filters);
  const [refunds, total] = await Promise.all([
    db.refund.findMany({ where, orderBy: [{ [p.sort]: p.dir }, { id: "asc" }], skip: p.skip, take: p.take }),
    db.refund.count({ where }),
  ]);
  return { rows: await hydrate(user, refunds), total };
}

export async function getRefund(user: CurrentUser, id: string) {
  const refund = await db.refund.findUnique({ where: { id } });
  if (!refund) return null;
  const [row] = await hydrate(user, [refund]);
  const transaction = await db.cardTransaction.findUnique({ where: { id: refund.transactionId } });
  return { ...row, transaction };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The numbers Payments Ops watches, for the queue's StatCards. */
export async function refundStats(now = new Date()) {
  const [pending, refunded7d, autoFailed, approvalFailed, decided] = await Promise.all([
    db.approvalRequest.aggregate({
      where: { tool: manifest.slug, status: "pending" },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
    db.refund.aggregate({
      where: { status: "executed", executedAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    db.refund.count({ where: { requiresApproval: false, status: "failed" } }),
    db.approvalRequest.count({ where: { tool: manifest.slug, status: "failed" } }),
    db.approvalRequest.findMany({
      where: { tool: manifest.slug, status: { in: ["approved", "executed"] }, decidedAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
      select: { createdAt: true, decidedAt: true },
      orderBy: { decidedAt: "desc" },
      take: 1000,
    }),
  ]);
  return {
    pendingCount: pending._count._all,
    pendingCents: pending._sum.amountCents ?? 0,
    refunded7dCents: refunded7d._sum.amountCents ?? 0,
    refunded7dCount: refunded7d._count._all,
    failedCount: autoFailed + approvalFailed,
    medianApprovalMs: median(decided.flatMap((d) => (d.decidedAt ? [d.decidedAt.getTime() - d.createdAt.getTime()] : []))),
  };
}

export type LookupTransaction = {
  id: string;
  amountCents: number;
  currency: string;
  merchant: string;
  category: string;
  cardLast4: string;
  status: string;
  createdAt: Date;
  customerId: string;
  customerName: string | null;
  customerEmail: string | null;
  refundId: string | null;
  refundable: boolean;
};

/**
 * Find transactions by transaction ID, or by customer email for users who
 * can see PII. Returns at most 20, newest first.
 */
export async function lookupTransactions(user: CurrentUser, query: string): Promise<{ results: LookupTransaction[]; note?: string }> {
  const q = query.trim();
  if (!q) return { results: [] };
  let transactions;
  if (q.includes("@")) {
    if (!hasPermission(user, "pii:read")) return { results: [], note: "Searching by email needs permission to see customer PII. Search by transaction ID instead." };
    const customer = await db.customer.findFirst({ where: { email: q.toLowerCase() } });
    if (!customer) return { results: [], note: `No customer with email ${q}.` };
    transactions = await db.cardTransaction.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" }, take: 20 });
  } else {
    transactions = await db.cardTransaction.findMany({ where: { id: { contains: q } }, orderBy: { id: "asc" }, take: 20 });
  }
  if (transactions.length === 0) return { results: [], note: `No transactions match "${q}".` };
  const [refunds, customers] = await Promise.all([
    db.refund.findMany({ where: { transactionId: { in: transactions.map((t) => t.id) } }, select: { id: true, transactionId: true } }),
    db.customer.findMany({ where: { id: { in: [...new Set(transactions.map((t) => t.customerId))] } }, select: { id: true, name: true, email: true } }),
  ]);
  const refundByTxn = new Map(refunds.map((r) => [r.transactionId, r.id]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  return {
    results: transactions.map((t) => {
      const refundId = refundByTxn.get(t.id) ?? null;
      const c = customerById.get(t.customerId);
      return maskRecord(
        {
          id: t.id,
          amountCents: t.amountCents,
          currency: t.currency,
          merchant: t.merchant,
          category: t.category,
          cardLast4: t.cardLast4,
          status: t.status,
          createdAt: t.createdAt,
          customerId: t.customerId,
          customerName: c?.name ?? null,
          customerEmail: c?.email ?? null,
          refundId,
          refundable: !refundId && t.status === REFUNDABLE_TRANSACTION_STATUS,
        },
        manifest.piiFields,
        user,
      );
    }),
  };
}

export async function getTransactionForRefund(user: CurrentUser, transactionId: string): Promise<LookupTransaction | null> {
  const { results } = await lookupTransactions(user, transactionId);
  return results.find((t) => t.id === transactionId) ?? null;
}
