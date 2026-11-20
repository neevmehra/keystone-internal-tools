import { Inbox } from "lucide-react";
import { requirePagePermission } from "@/platform/auth";
import { DataTable, EmptyState, PageHeader, RelativeTime, StatusBadge, parseTableParams, type SearchParams } from "@/platform/ui";
import { manifest } from "../manifest";
import { FILTERS, SORTABLE, listRecords } from "../queries";

export async function QueuePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePagePermission(manifest.readPermission);
  const params = parseTableParams(await searchParams, { sortable: SORTABLE, defaultSort: "createdAt", filters: FILTERS });
  const { rows, total } = await listRecords(user, params);
  return (
    <div>
      <PageHeader title={manifest.name} description={manifest.description} />
      <DataTable
        columns={[
          { id: "id", header: "ID" },
          { id: "name", header: "Name", sortable: true },
          { id: "email", header: "Email" },
          { id: "status", header: "Status", sortable: true },
          { id: "riskTier", header: "Risk", sortable: true },
          { id: "createdAt", header: "Created", sortable: true },
        ]}
        rows={rows.map((r) => ({
          id: r.id,
          href: `/tools/${manifest.slug}/${r.id}`,
          cells: {
            id: <span className="font-mono text-xs">{r.id}</span>,
            name: r.name,
            email: <span className="text-muted-foreground">{r.email}</span>,
            status: <StatusBadge status={r.status} />,
            riskTier: <StatusBadge status={r.riskTier} />,
            createdAt: <RelativeTime date={r.createdAt} />,
          },
        }))}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        sort={params.sort}
        dir={params.dir}
        filterValues={params.filters}
        filters={[
          { id: "id", label: "ID", type: "text", placeholder: "Customer ID" },
          { id: "status", label: "Status", type: "select", options: ["active", "restricted", "closed"].map((v) => ({ label: v, value: v })) },
          { id: "riskTier", label: "Risk", type: "select", options: ["low", "medium", "high"].map((v) => ({ label: v, value: v })) },
        ]}
        emptyState={<EmptyState icon={<Inbox />} title="Nothing here" description="Try clearing the filters." />}
      />
    </div>
  );
}
