import type { AuditFilters } from "@/platform/audit";

export const AUDIT_FILTER_KEYS = ["tool", "action", "actor", "entityType", "entityId", "from", "to"] as const;

export function toAuditFilters(f: Record<string, string>): AuditFilters {
  const date = (v: string | undefined, end = false) => {
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
    return new Date(`${v}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  };
  return {
    tool: f.tool,
    action: f.action,
    actor: f.actor,
    entityType: f.entityType,
    entityId: f.entityId,
    from: date(f.from),
    to: date(f.to, true),
  };
}
