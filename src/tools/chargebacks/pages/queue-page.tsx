import { ShieldCheck } from "lucide-react";
import { requirePagePermission } from "@/platform/auth";
import { DataTable, EmptyState, Money, PageHeader, StatCards, StatusBadge, parseTableParams, type SearchParams } from "@/platform/ui";
import { manifest } from "../manifest";
import { FILTERS, SORTABLE, STATUS_FILTER_DEFAULT, getDisputeStats, listDisputes } from "../queries";
import { DISPUTE_STATUSES, REASON_CODES, REASON_LABELS, STATUS_LABELS, type DisputeStatus } from "../rules";
import { DeadlineBadge } from "./DeadlineBadge";

const STATUS_TONES: Partial<Record<DisputeStatus, "info" | "success" | "warning" | "danger" | "neutral">> = {
  open: "info",
  in_progress: "warning",
  won: "success",
  lost: "danger",
  written_off: "neutral",
};

export function DisputeStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={STATUS_LABELS[status as DisputeStatus] ?? status} tone={STATUS_TONES[status as DisputeStatus]} />;
}

export async function QueuePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePagePermission(manifest.readPermission);
  const params = parseTableParams(await searchParams, { sortable: SORTABLE, defaultSort: "respondBy", defaultDir: "asc", filters: FILTERS });
  const now = new Date();
  const [{ rows, total }, stats] = await Promise.all([listDisputes(user, params), getDisputeStats(now)]);

  return (
    <div className="space-y-5">
      <PageHeader title={manifest.name} description="Open card disputes, closest response deadline first." />
      <StatCards
        items={[
          { label: "Open", value: stats.open.toLocaleString(), hint: `${stats.unassigned} not picked up yet` },
          {
            label: "Due this week",
            value: stats.dueThisWeek.toLocaleString(),
            hint: stats.overdue ? <span className="text-red-600">{stats.overdue} overdue</span> : "None overdue",
          },
          {
            label: "Win rate",
            value: stats.winRate === null ? "—" : `${Math.round(stats.winRate * 100)}%`,
            hint: `Last 90 days, ${stats.resolved90} resolved`,
          },
          {
            label: "Lost this month",
            value: <Money cents={stats.lostThisMonthCents} />,
            hint: `${stats.lostThisMonthCount} disputes · ${stats.pendingWriteOffs} write-offs awaiting finance`,
          },
        ]}
      />
      <DataTable
        label="Disputes"
        columns={[
          { id: "id", header: "Dispute" },
          { id: "customerEmail", header: "Customer" },
          { id: "amountCents", header: "Amount", sortable: true, align: "right" },
          { id: "reason", header: "Reason" },
          { id: "respondBy", header: "Respond by", sortable: true },
          { id: "status", header: "Status", sortable: true },
          { id: "assignee", header: "Assigned to" },
        ]}
        rows={rows.map((r) => ({
          id: r.id,
          href: `/tools/${manifest.slug}/${r.id}`,
          cells: {
            id: (
              <div>
                <p className="font-mono text-xs">{r.id}</p>
                <p className="text-xs text-muted-foreground">{r.merchant}</p>
              </div>
            ),
            customerEmail: <span className="text-muted-foreground">{r.customerEmail}</span>,
            amountCents: <Money cents={r.amountCents} currency={r.currency} />,
            reason: REASON_LABELS[r.reasonCode as keyof typeof REASON_LABELS] ?? r.reasonCode,
            respondBy: <DeadlineBadge status={r.status} respondBy={r.respondBy} now={now} />,
            status: <DisputeStatusBadge status={r.status} />,
            assignee: r.assignedToName ?? <span className="text-muted-foreground">Unassigned</span>,
          },
        }))}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        sort={params.sort}
        dir={params.dir}
        filterValues={{ ...params.filters, status: params.filters.status ?? STATUS_FILTER_DEFAULT }}
        filters={[
          { id: "q", label: "Search", type: "text", placeholder: "Dispute or transaction ID" },
          {
            id: "status",
            label: "Status",
            type: "select",
            options: [
              { label: "Open + in progress", value: "active" },
              { label: "Any status", value: "all" },
              ...DISPUTE_STATUSES.map((s) => ({ label: STATUS_LABELS[s], value: s })),
            ],
          },
          { id: "reason", label: "Reason", type: "select", options: REASON_CODES.map((r) => ({ label: REASON_LABELS[r], value: r })) },
          {
            id: "assigned",
            label: "Assigned",
            type: "select",
            options: [
              { label: "To me", value: "me" },
              { label: "Unassigned", value: "unassigned" },
            ],
          },
        ]}
        emptyState={<EmptyState icon={<ShieldCheck />} title="No disputes match" description="Nothing to work here. Try another status or clear the filters." />}
      />
    </div>
  );
}
