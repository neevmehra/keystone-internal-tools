import type { NextRequest } from "next/server";
import { iterateAuditEvents } from "@/platform/audit";
import { maskAuditEvent } from "@/platform/audit/masking";
import { getCurrentUser } from "@/platform/auth/current-user";
import { hasPermission } from "@/platform/rbac";
import { parseTableParams } from "@/platform/ui/table-params";
import { AUDIT_FILTER_KEYS, toAuditFilters } from "../filters";

const COLUMNS = ["id", "createdAt", "actorId", "actorName", "actorRoles", "tool", "action", "entityType", "entityId", "before", "after", "requestId"] as const;

const csv = (v: unknown) => {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Streams the filtered audit log as CSV. Requires audit:export; PII masked without pii:read. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "audit:export")) return new Response("Forbidden", { status: 403 });
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const { filters } = parseTableParams(sp, { sortable: ["createdAt"], defaultSort: "createdAt", filters: AUDIT_FILTER_KEYS });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`${COLUMNS.join(",")}\n`));
      for await (const event of iterateAuditEvents(toAuditFilters(filters))) {
        const masked = maskAuditEvent(event, user);
        controller.enqueue(encoder.encode(`${COLUMNS.map((c) => csv(masked[c])).join(",")}\n`));
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
