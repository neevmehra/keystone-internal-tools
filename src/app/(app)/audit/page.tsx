import { Download, ScrollText } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { AUDIT_SORTABLE, getAuditFacets, listAuditEvents } from "@/platform/audit";
import { maskAuditEvent } from "@/platform/audit/masking";
import { requirePagePermission } from "@/platform/auth";
import { hasPermission } from "@/platform/rbac";
import { DataTable, type DataTableRow } from "@/platform/ui/DataTable";
import { EmptyState } from "@/platform/ui/EmptyState";
import { PageHeader } from "@/platform/ui/PageHeader";
import { RelativeTime } from "@/platform/ui/RelativeTime";
import { parseTableParams, type SearchParams } from "@/platform/ui/table-params";
import { AUDIT_FILTER_KEYS, toAuditFilters } from "./filters";

function summarize(value: Record<string, unknown> | null) {
  if (!value) return "—";
  const s = JSON.stringify(value);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePagePermission("audit:read");
  const sp = await searchParams;
  const params = parseTableParams(sp, { sortable: AUDIT_SORTABLE, defaultSort: "createdAt", filters: AUDIT_FILTER_KEYS });
  const [{ rows, total }, facets] = await Promise.all([
    listAuditEvents({ filters: toAuditFilters(params.filters), sort: params.sort, dir: params.dir, skip: params.skip, take: params.take }),
    getAuditFacets(),
  ]);

  const tableRows: DataTableRow[] = rows
    .map((e) => maskAuditEvent(e, user))
    .map((e) => ({
      id: e.id,
      cells: {
        createdAt: <RelativeTime date={e.createdAt} />,
        actorName: (
          <div className="leading-tight">
            <p>{e.actorName}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{e.actorRoles.join(", ") || "no role"}</p>
          </div>
        ),
        tool: <span className="font-mono text-xs">{e.tool}</span>,
        action: <span className="font-mono text-xs">{e.action}</span>,
        entityType: (
          <div className="leading-tight">
            <p className="text-xs">{e.entityType}</p>
            <p className="max-w-40 truncate font-mono text-[11px] text-muted-foreground">{e.entityId}</p>
          </div>
        ),
        change: <span className="block max-w-72 truncate font-mono text-[11px] text-muted-foreground">{summarize(e.after)}</span>,
      },
    }));

  const exportQs = new URLSearchParams(params.filters).toString();

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every change in every tool, append-only. Filter, sort and share the URL."
        actions={
          hasPermission(user, "audit:export") && (
            <Link href={`/audit/export${exportQs ? `?${exportQs}` : ""}`} prefetch={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Download /> Export CSV
            </Link>
          )
        }
      />
      <DataTable
        columns={[
          { id: "createdAt", header: "When", sortable: true },
          { id: "actorName", header: "Actor", sortable: true },
          { id: "tool", header: "Tool", sortable: true },
          { id: "action", header: "Action", sortable: true },
          { id: "entityType", header: "Record", sortable: true },
          { id: "change", header: "After" },
        ]}
        rows={tableRows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        sort={params.sort}
        dir={params.dir}
        filterValues={params.filters}
        filters={[
          { id: "actor", label: "Actor", type: "text", placeholder: "Actor name" },
          { id: "action", label: "Action", type: "text", placeholder: "Action, e.g. approval" },
          { id: "tool", label: "Tool", type: "select", options: facets.tools.map((t) => ({ label: t, value: t })) },
          { id: "entityType", label: "Record", type: "select", options: facets.entityTypes.map((t) => ({ label: t, value: t })) },
          { id: "from", label: "From", type: "date" },
          { id: "to", label: "To", type: "date" },
        ]}
        emptyState={<EmptyState icon={<ScrollText />} title="No audit events match" description="Try clearing filters or widening the date range." />}
      />
    </div>
  );
}
