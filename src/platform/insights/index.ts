/**
 * Ops insights, computed from ApprovalRequest and AuditEvent. Read-only.
 */
import { db } from "@/platform/db";
import { hasPermission, type PermissionHolder } from "@/platform/rbac";
import { toolLabel } from "@/platform/ui/labels";
import { actionsPerDay, decisionTimesByTool, pendingByAge, percentile, separationOfDuties, topPeople } from "./compute";

export * from "./compute";

/** /insights is for people who work approvals or run the platform. */
export function canViewInsights(user: PermissionHolder | null | undefined) {
  return hasPermission(user, "approvals:view") || hasPermission(user, "admin:read");
}

const MAX_EVENTS = 50_000;

export async function getInsights(range: { from: Date; to: Date }, now = new Date()) {
  const inRange = { gte: range.from, lte: range.to };
  const [decided, pending, requested, events] = await Promise.all([
    db.approvalRequest.findMany({
      where: { decidedAt: inRange },
      select: { tool: true, createdAt: true, decidedAt: true, requestedById: true, decidedById: true, decidedByName: true },
    }),
    db.approvalRequest.findMany({ where: { status: "pending" }, select: { createdAt: true } }),
    db.approvalRequest.findMany({ where: { createdAt: inRange }, select: { requestedById: true, requestedByName: true } }),
    db.auditEvent.findMany({
      // Sign-ins are platform noise; this chart is about work done in tools.
      where: { createdAt: inRange, NOT: { action: { startsWith: "auth." } } },
      select: { tool: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: MAX_EVENTS,
    }),
  ]);

  const toolName = toolLabel;
  const daily = actionsPerDay(events, range.from, range.to);

  return {
    range,
    overallMedianMs: percentile(
      decided.flatMap((d) => (d.decidedAt ? [d.decidedAt.getTime() - d.createdAt.getTime()] : [])),
      50,
    ),
    decisionTimes: decisionTimesByTool(decided).map((d) => ({ ...d, toolName: toolName(d.tool) })),
    pendingByAge: pendingByAge(pending, now),
    pendingTotal: pending.length,
    daily: { ...daily, labels: Object.fromEntries(daily.tools.map((t) => [t, toolName(t)])) },
    eventsTotal: events.length,
    eventsCapped: events.length === MAX_EVENTS,
    topRequesters: topPeople(requested, (r) => r.requestedById, (r) => r.requestedByName),
    topDeciders: topPeople(decided, (r) => r.decidedById, (r) => r.decidedByName),
    separation: separationOfDuties(decided),
  };
}
