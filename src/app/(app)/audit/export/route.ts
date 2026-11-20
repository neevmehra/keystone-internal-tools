import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { iterateAuditEvents, recordAudit } from "@/platform/audit";
import { maskAuditEvent } from "@/platform/audit/masking";
import { getCurrentUser } from "@/platform/auth/current-user";
import { csvRow } from "@/platform/csv";
import { db } from "@/platform/db";
import { hasPermission } from "@/platform/rbac";
import { parseTableParams } from "@/platform/ui/table-params";
import { AUDIT_FILTER_KEYS, toAuditFilters } from "../filters";

const COLUMNS = ["id", "createdAt", "actorId", "actorName", "actorRoles", "tool", "action", "entityType", "entityId", "before", "after", "requestId"] as const;

/**
 * Streams the filtered audit log as CSV. Requires audit:export; PII masked
 * without pii:read. The export itself is recorded as an audit event first,
 * so there is a record of who took a copy of the log and with which filters.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "audit:export")) return new Response("Forbidden", { status: 403 });
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const { filters } = parseTableParams(sp, { sortable: ["createdAt"], defaultSort: "createdAt", filters: AUDIT_FILTER_KEYS });

  await db.$transaction((tx) =>
    recordAudit(tx, {
      actor: { id: user.id, name: user.name, roles: user.roles },
      tool: "platform",
      action: "audit.export",
      entityType: "AuditExport",
      entityId: `aex_${randomUUID()}`,
      before: null,
      after: { format: "csv", filters },
    }),
  );

  const encoder = new TextEncoder();
  const auditFilters = toAuditFilters(filters);
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(csvRow(COLUMNS)));
      for await (const event of iterateAuditEvents(auditFilters)) {
        const masked = maskAuditEvent(event, user);
        controller.enqueue(encoder.encode(csvRow(COLUMNS.map((c) => masked[c]))));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="keystone-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
