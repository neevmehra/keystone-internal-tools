import { Hammer, Plus } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { requirePagePermission } from "@/platform/auth";
import { canSeeAllRequests, listRequests, REQUEST_FILTER_KEYS, REQUEST_SORTABLE } from "@/platform/requests";
import { DataTable, type DataTableRow } from "@/platform/ui/DataTable";
import { EmptyState } from "@/platform/ui/EmptyState";
import { PageHeader } from "@/platform/ui/PageHeader";
import { RelativeTime } from "@/platform/ui/RelativeTime";
import { parseTableParams, type SearchParams } from "@/platform/ui/table-params";
import { tools } from "@/tools";
import { kindLabel, RequestStatusBadge } from "../components";
import { toolLabel } from "@/platform/ui/labels";

export default async function RequestsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePagePermission("requests:create");
  const params = parseTableParams(await searchParams, { sortable: REQUEST_SORTABLE, defaultSort: "createdAt", filters: REQUEST_FILTER_KEYS });
  const { rows, total } = await listRequests(user, { filters: params.filters, sort: params.sort, dir: params.dir, skip: params.skip, take: params.take });
  const all = canSeeAllRequests(user);

  const tableRows: DataTableRow[] = rows.map((r) => ({
    id: r.id,
    href: `/build/requests/${r.id}`,
    cells: {
      title: (
        <div className="leading-tight">
          <p className="font-medium">{r.title}</p>
          <p className="max-w-80 truncate text-xs text-muted-foreground">{r.problem}</p>
        </div>
      ),
      kind: <span className="text-xs">{kindLabel(r.kind)}</span>,
      tool: r.toolSlug ? toolLabel(r.toolSlug) : <span className="text-muted-foreground">New tool</span>,
      requestedByName: r.requestedByName,
      status: <RequestStatusBadge status={r.display} />,
      createdAt: <RelativeTime date={r.createdAt} />,
    },
  }));

  return (
    <div>
      <PageHeader
        title={all ? "All requests" : "My requests"}
        description={all ? "Every request for a new tool or a change, across the company." : "Requests you've made, and where each one is."}
        actions={
          <Link href="/build" className={buttonVariants({ size: "sm" })}>
            <Plus /> New request
          </Link>
        }
      />
      <DataTable
        columns={[
          { id: "title", header: "Request", sortable: true },
          { id: "kind", header: "Type", sortable: true },
          { id: "tool", header: "Tool" },
          ...(all ? [{ id: "requestedByName", header: "Requested by", sortable: true }] : []),
          { id: "status", header: "Status" },
          { id: "createdAt", header: "Submitted", sortable: true },
        ]}
        rows={tableRows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        sort={params.sort}
        dir={params.dir}
        filterValues={params.filters}
        filters={[
          { id: "q", label: "Search", type: "text", placeholder: "Title, problem or requester" },
          { id: "kind", label: "Type", type: "select", options: [{ label: "New tool", value: "new_tool" }, { label: "Change", value: "change_tool" }] },
          ...(tools.length ? [{ id: "tool", label: "Tool", type: "select" as const, options: tools.map((t) => ({ label: t.name, value: t.slug })) }] : []),
        ]}
        emptyState={<EmptyState icon={<Hammer />} title="No requests yet" description="Ask for a tool in plain language and Devin builds it." action={{ label: "New request", href: "/build" }} />}
      />
    </div>
  );
}
