/**
 * Approvals inbox queries. Reads only: decisions go through the approvals
 * engine (approve/reject/execute) via its server actions.
 */
import type { ApprovalRequest, Prisma } from "@prisma/client";
import { db } from "@/platform/db";
import { hasPermission, requirePermission, type PermissionHolder } from "@/platform/rbac";
import { getTool } from "@/platform/registry";

export const INBOX_TABS = ["pending", "decided", "mine"] as const;
export type InboxTab = (typeof INBOX_TABS)[number];
export const INBOX_SORTABLE = ["createdAt", "amountCents", "tool"] as const;
export type InboxSort = (typeof INBOX_SORTABLE)[number];

export type InboxUser = PermissionHolder & { id: string };

export type InboxItem = ApprovalRequest & {
  /** True only for pending requests the user may decide (never their own). */
  canDecide: boolean;
  isOwn: boolean;
  toolName: string;
  /** Link to the record in its tool, when the tool is registered. */
  recordHref: string | null;
};

export function parseInboxTab(value: string | string[] | undefined): InboxTab {
  const v = Array.isArray(value) ? value[0] : value;
  return (INBOX_TABS as readonly string[]).includes(v ?? "") ? (v as InboxTab) : "pending";
}

function decidablePermissions(user: InboxUser) {
  return user.permissions.filter((p) => hasPermission(user, p));
}

export function inboxWhere(user: InboxUser, tab: InboxTab, tool?: string): Prisma.ApprovalRequestWhereInput {
  const base: Prisma.ApprovalRequestWhereInput =
    tab === "pending"
      ? {
          status: "pending",
          OR: [{ approvePermission: { in: decidablePermissions(user) }, NOT: { requestedById: user.id } }, { requestedById: user.id }],
        }
      : tab === "decided"
        ? { decidedById: user.id }
        : { requestedById: user.id };
  return tool ? { AND: [base, { tool }] } : base;
}

export function toInboxItem(user: InboxUser, r: ApprovalRequest): InboxItem {
  const isOwn = r.requestedById === user.id;
  const tool = getTool(r.tool);
  return {
    ...r,
    isOwn,
    canDecide: r.status === "pending" && !isOwn && hasPermission(user, r.approvePermission),
    toolName: tool?.name ?? r.tool,
    recordHref: tool ? `/tools/${tool.slug}/${encodeURIComponent(r.entityId)}` : null,
  };
}

/** One page of the inbox. Throws without approvals:view. */
export async function listInbox(
  user: InboxUser,
  opts: { tab: InboxTab; tool?: string; sort?: InboxSort; dir?: "asc" | "desc"; skip?: number; take?: number },
): Promise<{ rows: InboxItem[]; total: number }> {
  requirePermission(user, "approvals:view");
  const where = inboxWhere(user, opts.tab, opts.tool);
  const dir = opts.dir ?? (opts.tab === "pending" ? "asc" : "desc");
  const order: Prisma.ApprovalRequestOrderByWithRelationInput =
    opts.sort === "amountCents" ? { amountCents: dir } : opts.sort === "tool" ? { tool: dir } : { createdAt: dir };
  const [rows, total] = await Promise.all([
    db.approvalRequest.findMany({
      where,
      orderBy: [order, { id: "asc" }],
      skip: opts.skip ?? 0,
      take: opts.take ?? 25,
    }),
    db.approvalRequest.count({ where }),
  ]);
  return { rows: rows.map((r) => toInboxItem(user, r)), total };
}

/** Oldest pending requests this user can decide (for the portal home). */
export async function topPendingForUser(user: InboxUser, take = 5): Promise<InboxItem[]> {
  if (!hasPermission(user, "approvals:view")) return [];
  const rows = await db.approvalRequest.findMany({
    where: { status: "pending", approvePermission: { in: decidablePermissions(user) }, NOT: { requestedById: user.id } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take,
  });
  return rows.map((r) => toInboxItem(user, r));
}

/** Tools that appear in this user's inbox, for the filter. */
export async function inboxTools(user: InboxUser): Promise<string[]> {
  const rows = await db.approvalRequest.findMany({
    where: { OR: [inboxWhere(user, "pending"), inboxWhere(user, "decided"), inboxWhere(user, "mine")] },
    distinct: ["tool"],
    select: { tool: true },
    orderBy: { tool: "asc" },
  });
  return rows.map((r) => r.tool);
}
