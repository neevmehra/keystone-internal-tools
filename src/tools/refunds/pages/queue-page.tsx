import { Plus, ReceiptText } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { requirePagePermission } from "@/platform/auth";
import { hasPermission } from "@/platform/rbac";
import { DataTable, EmptyState, Money, PageHeader, RelativeTime, StatCards, StatusBadge, humanize, parseTableParams, type SearchParams } from "@/platform/ui";
import { REFUND_REASONS, REFUND_STATUSES, manifest } from "../manifest";
import { FILTERS, SORTABLE, listRefunds, refundStats } from "../queries";

function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export async function QueuePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePagePermission(manifest.readPermission);
  const params = parseTableParams(await searchParams, { sortable: SORTABLE, defaultSort: "createdAt", filters: FILTERS });
  const [{ rows, total }, stats] = await Promise.all([listRefunds(user, params), refundStats()]);
  const canRequest = hasPermission(user, "refunds:request");

  return (
    <div className="space-y-5">
      <PageHeader
        title={manifest.name}
        description={`${manifest.description}. Refunds over $100.00 need a finance approver who isn't the requester.`}
        actions={
          canRequest && (
            <Link href="/tools/refunds/new" className={buttonVariants({ size: "sm" })}>
              <Plus className="size-4" />
              New refund
            </Link>
          )
        }
      />
      <StatCards
        items={[
          {
            label: "Pending approval",
            value: stats.pendingCount,
            hint: (
              <>
                <Money cents={stats.pendingCents} /> waiting on finance
              </>
            ),
          },
          { label: "Refunded, last 7 days", value: <Money cents={stats.refunded7dCents} />, hint: `${stats.refunded7dCount} refunds` },
          { label: "Failed", value: stats.failedCount, hint: stats.failedCount ? "Need a retry" : "All clear" },
          { label: "Median time to approval", value: formatDuration(stats.medianApprovalMs), hint: "Last 30 days" },
        ]}
      />
      <DataTable
        label="Refunds"
        columns={[
          { id: "id", header: "Refund" },
          { id: "customer", header: "Customer" },
          { id: "amountCents", header: "Amount", sortable: true, align: "right" },
          { id: "reason", header: "Reason" },
          { id: "status", header: "Status" },
          { id: "requestedBy", header: "Requested by" },
          { id: "createdAt", header: "Requested", sortable: true },
        ]}
        rows={rows.map((r) => ({
          id: r.id,
          href: `/tools/refunds/${r.id}`,
          cells: {
            id: (
              <div>
                <p className="font-mono text-xs">{r.id}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{r.transactionId}</p>
              </div>
            ),
            customer: (
              <div className="min-w-0">
                <p className="truncate">{r.customerName ?? r.customerId}</p>
                <p className="truncate text-xs text-muted-foreground">{r.customerEmail}</p>
              </div>
            ),
            amountCents: <Money cents={r.amountCents} currency={r.currency} />,
            reason: humanize(r.reason),
            status: <StatusBadge status={r.effectiveStatus} />,
            requestedBy: r.requestedByName,
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
          { id: "q", label: "ID", type: "text", placeholder: "Refund or transaction ID" },
          { id: "status", label: "Status", type: "select", options: REFUND_STATUSES.map((v) => ({ label: humanize(v), value: v })) },
          { id: "reason", label: "Reason", type: "select", options: REFUND_REASONS.map((v) => ({ label: humanize(v), value: v })) },
          { id: "min", label: "Min $", type: "text", placeholder: "Min $" },
          { id: "max", label: "Max $", type: "text", placeholder: "Max $" },
          { id: "from", label: "From", type: "date" },
          { id: "to", label: "To", type: "date" },
        ]}
        emptyState={
          <EmptyState
            icon={<ReceiptText />}
            title="No refunds match"
            description="Try clearing the filters."
            action={canRequest ? { label: "Request a refund", href: "/tools/refunds/new" } : undefined}
          />
        }
      />
    </div>
  );
}
