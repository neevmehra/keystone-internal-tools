import { Download, ExternalLink, History, ScrollText } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { AUDIT_SORTABLE, getAuditFacets, listAuditEvents } from "@/platform/audit";
import { historyHref, recordHref } from "@/platform/audit/links";
import { maskAuditEvent } from "@/platform/audit/masking";
import { requirePagePermission } from "@/platform/auth";
import { hasPermission } from "@/platform/rbac";
import { DataTable, type DataTableRow } from "@/platform/ui/DataTable";
import { EmptyState } from "@/platform/ui/EmptyState";
import { PageHeader } from "@/platform/ui/PageHeader";
import { eventTitle } from "@/platform/ui/audit-format";
import { humanize, roleLabel, toolLabel } from "@/platform/ui/labels";
import { RelativeTime } from "@/platform/ui/RelativeTime";
import { parseTableParams, type SearchParams } from "@/platform/ui/table-params";
import { AuditDiff } from "./AuditDiff";
import { AUDIT_FILTER_KEYS, toAuditFilters } from "./filters";

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
            <p className="text-[11px] text-muted-foreground">{e.actorRoles.map(roleLabel).join(", ") || "No role"}</p>
          </div>
        ),
        tool: <span className="whitespace-nowrap">{toolLabel(e.tool)}</span>,
        action: (
          <div className="leading-tight">
            <p>{eventTitle(e.action)}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{e.action}</p>
          </div>
        ),
        entityType: (
          <div className="leading-tight">
            <p className="text-xs">{humanize(e.entityType)}</p>
            <p className="max-w-40 truncate font-mono text-[11px] text-muted-foreground">{e.entityId}</p>
            <div className="mt-1 flex items-center gap-2 text-[11px]">
              {(() => {
                const href = recordHref(e);
                return (
                  href && (
                    <Link href={href} className="inline-flex items-center gap-0.5 text-primary hover:underline">
                      Open <ExternalLink className="size-3" />
                    </Link>
                  )
                );
              })()}
              <Link href={historyHref(e)} className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground">
                <History className="size-3" /> History
              </Link>
            </div>
          </div>
        ),
        change: <AuditDiff action={e.action} before={e.before} after={e.after} />,
      },
    }));

  const exportQs = new URLSearchParams(params.filters).toString();

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every change in every tool, append-only, with field-level diffs. Filter, sort and share the URL. Exports are themselves audited."
        actions={
          hasPermission(user, "audit:export") && (
            <Link href={`/audit/export${exportQs ? `?${exportQs}` : ""}`} prefetch={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Download /> Export CSV
            </Link>
          )
        }
      />
      <DataTable
        label="Audit log"
        columns={[
          { id: "createdAt", header: "When", sortable: true },
          { id: "actorName", header: "Actor", sortable: true },
          { id: "tool", header: "Tool", sortable: true },
          { id: "action", header: "Action", sortable: true },
          { id: "entityType", header: "Record", sortable: true },
          { id: "change", header: "Changes" },
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
          { id: "tool", label: "Tool", type: "select", options: facets.tools.map((t) => ({ label: toolLabel(t), value: t })) },
          { id: "entityType", label: "Record", type: "select", options: facets.entityTypes.map((t) => ({ label: humanize(t), value: t })) },
          { id: "entityId", label: "Record ID", type: "text", placeholder: "Record ID" },
          { id: "from", label: "From", type: "date" },
          { id: "to", label: "To", type: "date" },
        ]}
        emptyState={<EmptyState icon={<ScrollText />} title="No audit events match" description="Try clearing filters or widening the date range." />}
      />
    </div>
  );
}
