/**
 * Cross-tool customer view: profile, headline numbers, a merged activity
 * timeline and global search. Every tool contributes through its customer
 * panels (src/tools/customer-panels.ts); this module only calls a tool's
 * panel for users who can read that tool, and masks customer PII on the
 * server before anything reaches the browser.
 */
import type { CardTransaction, Customer } from "@prisma/client";
import { recordAudit, toAuditView } from "@/platform/audit";
import type { CurrentUser } from "@/platform/auth/types";
import { db } from "@/platform/db";
import type { CustomerActivity, CustomerPanel, CustomerSearchResult } from "@/platform/manifest";
import { hasPermission, maskRecord, type PermissionHolder } from "@/platform/rbac";
import { getTool, toolsForUser } from "@/platform/registry";
import { formatCurrency, humanize } from "@/platform/ui/format";
import type { StatCard } from "@/platform/ui/StatCards";
import { customerPanels as registeredPanels } from "@/tools/customer-panels";

/** Customer fields that are PII. Masked for users without `pii:read`. */
export const CUSTOMER_PII_FIELDS = ["name", "email", "phone"] as const;

export const TIMELINE_PAGE_SIZE = 25;
const MIN_QUERY = 3;
const MAX_RESULTS = 20;

/** Anyone who can open at least one tool can look customers up. */
export function canViewCustomers(user: PermissionHolder) {
  return toolsForUser(user).length > 0;
}

/** Panels for tools this user can read, in registry order. */
export function panelsForUser(user: PermissionHolder, panels: readonly CustomerPanel[] = registeredPanels): CustomerPanel[] {
  return panels.filter((p) => {
    const tool = getTool(p.tool);
    return tool !== undefined && hasPermission(user, tool.readPermission);
  });
}

export function maskCustomer<T extends Partial<Customer>>(customer: T, user: PermissionHolder): T {
  return maskRecord(customer, CUSTOMER_PII_FIELDS, user);
}

export async function getCustomer(user: CurrentUser, id: string) {
  const customer = await db.customer.findUnique({ where: { id } });
  return customer && maskCustomer(customer, user);
}

/**
 * Viewing a customer exposes their data, so it's audited. A read has no
 * change to commit, so this writes the audit event in its own transaction.
 */
export async function recordCustomerView(user: CurrentUser, customerId: string) {
  return db.$transaction((tx) =>
    recordAudit(tx, {
      actor: { id: user.id, name: user.name, roles: user.roles },
      tool: "platform",
      action: "customer.view",
      entityType: "Customer",
      entityId: customerId,
      before: null,
      after: null,
    }),
  );
}

/** Lifetime card volume plus each readable tool's headline numbers. */
export async function getCustomerStats(user: CurrentUser, customerId: string): Promise<StatCard[]> {
  const volume = await db.cardTransaction.aggregate({
    where: { customerId, status: { not: "declined" } },
    _sum: { amountCents: true },
    _count: true,
  });
  const toolStats = await Promise.all(panelsForUser(user).map((p) => p.stats?.({ customerId, user }) ?? Promise.resolve([])));
  return [
    {
      label: "Lifetime volume",
      value: formatCurrency(volume._sum.amountCents ?? 0),
      hint: `${volume._count} card transaction${volume._count === 1 ? "" : "s"}`,
    },
    ...toolStats.flat(),
  ];
}

function transactionActivity(t: CardTransaction): CustomerActivity {
  return {
    id: `platform:${t.id}`,
    at: t.createdAt,
    tool: "platform",
    kind: "Card transaction",
    title: `${t.merchant} · card •••• ${t.cardLast4}`,
    detail: `${t.id} · ${t.category}`,
    amountCents: t.amountCents,
    status: t.status,
  };
}

type Source = (take: number) => Promise<{ items: CustomerActivity[]; total: number }>;

/**
 * One timeline merging card transactions, every readable tool's records and
 * the audit history of those records, newest first. Each source returns its
 * newest `skip + take` entries, so paging stays server-side and bounded.
 */
export async function getCustomerTimeline(user: CurrentUser, customerId: string, page = 1, pageSize = TIMELINE_PAGE_SIZE) {
  const panels = panelsForUser(user);
  const ctx = { customerId, user };

  const sources: Source[] = [
    async (take) => {
      const [rows, total] = await Promise.all([
        db.cardTransaction.findMany({ where: { customerId }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take }),
        db.cardTransaction.count({ where: { customerId } }),
      ]);
      return { items: rows.map(transactionActivity), total };
    },
    ...panels.flatMap((p) => (p.activity ? [(take: number) => p.activity!(ctx, { take })] : [])),
  ];

  // Audit history of the tools' records, plus (for auditors) who viewed this customer.
  const entityGroups = (await Promise.all(panels.map((p) => p.auditEntities?.(ctx) ?? Promise.resolve([])))).flat();
  const or = entityGroups.filter((g) => g.entityIds.length > 0).map((g) => ({ entityType: g.entityType, entityId: { in: g.entityIds } }));
  if (hasPermission(user, "audit:read")) or.push({ entityType: "Customer", entityId: { in: [customerId] } });
  if (or.length) {
    sources.push(async (take) => {
      const where = { OR: or };
      const [rows, total] = await Promise.all([
        db.auditEvent.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take }),
        db.auditEvent.count({ where }),
      ]);
      return {
        total,
        items: rows.map(toAuditView).map((e) => ({
          id: `audit:${e.id}`,
          at: e.createdAt,
          tool: e.tool,
          kind: "Activity",
          title: `${e.actorName}: ${humanize(e.action)}`,
          detail: `${e.entityType} ${e.entityId}`,
          href: hasPermission(user, "audit:read")
            ? `/audit?${new URLSearchParams({ entityType: e.entityType, entityId: e.entityId })}`
            : undefined,
        })),
      };
    });
  }

  const safePage = Math.max(1, Math.floor(page));
  const skip = (safePage - 1) * pageSize;
  const results = await Promise.all(sources.map((s) => s(skip + pageSize)));
  const merged = results
    .flatMap((r) => r.items)
    .sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id));
  const total = results.reduce((n, r) => n + r.total, 0);
  return { items: merged.slice(skip, skip + pageSize), total, page: safePage, pageSize };
}

export type SearchOutcome = {
  results: CustomerSearchResult[];
  /** The query looked like an email or name, but the user can't search PII. */
  piiSearchBlocked: boolean;
};

const looksLikeId = (q: string) => /^[a-z]{2,5}_[\w-]*$/i.test(q);

/**
 * Global search. IDs work for anyone who can open a tool; emails and names
 * need `pii:read`. Tool records only come from tools the user can read, and
 * customer details in results are masked.
 */
export async function searchCustomers(user: CurrentUser, rawQuery: string): Promise<SearchOutcome> {
  const q = rawQuery.trim().slice(0, 100);
  if (q.length < MIN_QUERY || !canViewCustomers(user)) return { results: [], piiSearchBlocked: false };

  const results: CustomerSearchResult[] = [];
  let piiSearchBlocked = false;
  const customerResult = (c: Pick<Customer, "id" | "name" | "email">): CustomerSearchResult => {
    const m = maskCustomer(c, user);
    return { id: `customer:${c.id}`, type: "Customer", title: m.name, subtitle: `${c.id} · ${m.email}`, href: `/customers/${c.id}`, customerId: c.id };
  };

  if (looksLikeId(q)) {
    if (/^cus_/i.test(q)) {
      const rows = await db.customer.findMany({ where: { id: { startsWith: q } }, orderBy: { id: "asc" }, take: 5 });
      results.push(...rows.map(customerResult));
    }
    if (/^txn_/i.test(q)) {
      const rows = await db.cardTransaction.findMany({ where: { id: { startsWith: q } }, orderBy: { id: "asc" }, take: 5 });
      results.push(
        ...rows.map((t) => ({
          id: `transaction:${t.id}`,
          type: "Transaction",
          title: t.id,
          subtitle: `${formatCurrency(t.amountCents)} · ${t.merchant}`,
          href: `/customers/${t.customerId}`,
          customerId: t.customerId,
        })),
      );
    }
    const toolResults = await Promise.all(panelsForUser(user).map((p) => p.search?.(q, user) ?? Promise.resolve([])));
    results.push(...toolResults.flat());
  } else if (hasPermission(user, "pii:read")) {
    const rows = await db.customer.findMany({
      where: { OR: [{ email: { contains: q } }, { name: { contains: q } }] },
      orderBy: { id: "asc" },
      take: 10,
    });
    results.push(...rows.map(customerResult));
  } else {
    piiSearchBlocked = true;
  }

  return { results: results.slice(0, MAX_RESULTS), piiSearchBlocked };
}
