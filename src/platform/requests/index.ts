/**
 * "Build with Devin" request center: queries. Writes live in mutations.ts
 * (defineAction) and the launch executor in executor.ts.
 */
import type { ApprovalRequest, Prisma, ToolRequest } from "@prisma/client";
import type { CurrentUser } from "@/platform/auth/types";
import { db } from "@/platform/db";
import { fromJson } from "@/platform/json";
import { hasPermission, type PermissionHolder } from "@/platform/rbac";
import type { Role } from "@/platform/rbac/permissions";
import { getTool } from "@/platform/registry";
import { computeImpact, parsePrice } from "./impact";
import { displayStatus, type DisplayStatus } from "./status";

export const LAUNCH_ACTION = "build.launch_devin_session";
export const REQUESTS_TOOL = "build";

export type ToolRequestView = Omit<ToolRequest, "audienceGroups" | "simulatedPayload"> & {
  audienceGroups: string[];
  simulatedPayload: unknown;
  approval: ApprovalRequest | null;
  display: DisplayStatus;
};

/** Admins (admin:read) see every request; everyone else sees their own. */
export function canSeeAllRequests(user: PermissionHolder) {
  return hasPermission(user, "admin:read");
}

export function canViewRequest(user: CurrentUser, req: Pick<ToolRequest, "requestedById">) {
  return req.requestedById === user.id || canSeeAllRequests(user);
}

async function withApprovals(rows: ToolRequest[]): Promise<ToolRequestView[]> {
  const ids = rows.map((r) => r.approvalRequestId).filter((id): id is string => !!id);
  const approvals = ids.length ? await db.approvalRequest.findMany({ where: { id: { in: ids } } }) : [];
  const byId = new Map(approvals.map((a) => [a.id, a]));
  return rows.map((r) => {
    const approval = r.approvalRequestId ? (byId.get(r.approvalRequestId) ?? null) : null;
    return {
      ...r,
      audienceGroups: fromJson<string[]>(r.audienceGroups, []),
      simulatedPayload: fromJson<unknown>(r.simulatedPayload, null),
      approval,
      display: displayStatus(r, approval),
    };
  });
}

export const REQUEST_SORTABLE = ["createdAt", "title", "requestedByName", "kind"] as const;
export type RequestSort = (typeof REQUEST_SORTABLE)[number];
export const REQUEST_FILTER_KEYS = ["q", "kind", "tool"] as const;

export async function listRequests(
  user: CurrentUser,
  opts: { filters?: Record<string, string>; sort?: RequestSort; dir?: "asc" | "desc"; skip?: number; take?: number } = {},
): Promise<{ rows: ToolRequestView[]; total: number }> {
  const f = opts.filters ?? {};
  const where: Prisma.ToolRequestWhereInput = {
    ...(!canSeeAllRequests(user) && { requestedById: user.id }),
    ...(f.kind && { kind: f.kind }),
    ...(f.tool && { toolSlug: f.tool }),
    ...(f.q && { OR: [{ title: { contains: f.q } }, { problem: { contains: f.q } }, { requestedByName: { contains: f.q } }] }),
  };
  const [rows, total] = await Promise.all([
    db.toolRequest.findMany({
      where,
      orderBy: [{ [opts.sort ?? "createdAt"]: opts.dir ?? "desc" }, { id: "desc" }],
      skip: opts.skip ?? 0,
      take: Math.min(opts.take ?? 25, 100),
    }),
    db.toolRequest.count({ where }),
  ]);
  return { rows: await withApprovals(rows), total };
}

export async function getRequest(id: string): Promise<ToolRequestView | null> {
  const row = await db.toolRequest.findUnique({ where: { id } });
  return row ? (await withApprovals([row]))[0] : null;
}

export async function latestRequestsForUser(user: CurrentUser, take = 3): Promise<ToolRequestView[]> {
  const rows = await db.toolRequest.findMany({ where: { requestedById: user.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take });
  return withApprovals(rows);
}

export async function loadImpact(env: Record<string, string | undefined> = process.env) {
  const [requests, users] = await Promise.all([db.toolRequest.findMany(), db.user.findMany({ select: { id: true, groups: true, roles: true } })]);
  const views = await withApprovals(requests);
  const impact = computeImpact({
    requests: views.map((r) => ({
      status: r.status,
      prState: r.prState,
      toolSlug: r.toolSlug,
      audienceGroups: r.audienceGroups,
      hoursPerWeek: r.hoursPerWeek,
      acusUsed: r.acusUsed,
      approvalStatus: r.approval?.status ?? null,
    })),
    users: users.map((u) => ({ id: u.id, groups: fromJson<string[]>(u.groups, []), roles: fromJson<Role[]>(u.roles, []) })),
    readPermissionFor: (slug) => getTool(slug)?.readPermission ?? `${slug}:read`,
    acuPrice: parsePrice(env.DEVIN_ACU_PRICE, null),
    seatPrice: parsePrice(env.POWERAPPS_SEAT_PRICE, 22) ?? 22,
  });
  return { impact, requests: views };
}
