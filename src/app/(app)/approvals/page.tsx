import { BarChart3, CheckCheck, Inbox, Send } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { INBOX_SORTABLE, inboxTools, listInbox, parseInboxTab, type InboxItem, type InboxTab } from "@/platform/approvals/inbox";
import { requirePagePermission } from "@/platform/auth";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/platform/ui/DataTable";
import { EmptyState } from "@/platform/ui/EmptyState";
import { humanize } from "@/platform/ui/format";
import { InboxDecision } from "@/platform/ui/InboxDecision";
import { Money } from "@/platform/ui/Money";
import { PageHeader } from "@/platform/ui/PageHeader";
import { RelativeTime } from "@/platform/ui/RelativeTime";
import { StatusBadge } from "@/platform/ui/StatusBadge";
import { parseTableParams, type SearchParams } from "@/platform/ui/table-params";

const TABS: Array<{ id: InboxTab; label: string }> = [
  { id: "pending", label: "Pending" },
  { id: "decided", label: "Decided by me" },
  { id: "mine", label: "Requested by me" },
];

const EMPTY: Record<InboxTab, { icon: React.ReactNode; title: string; description: string }> = {
  pending: { icon: <Inbox />, title: "You're all caught up", description: "Requests that need your sign-off land here, oldest first." },
  decided: { icon: <CheckCheck />, title: "No decisions yet", description: "Approvals and rejections you make show up here with your reason." },
  mine: { icon: <Send />, title: "No requests from you", description: "Anything you send for approval shows up here with its status." },
};

function what(r: InboxItem) {
  const label = (
    <div className="leading-tight">
      <p>{humanize(r.actionType.split(".").pop() ?? r.actionType)}</p>
      <p className="max-w-48 truncate font-mono text-[11px] text-muted-foreground">
        {r.entityType} {r.entityId}
      </p>
    </div>
  );
  return r.recordHref ? (
    <Link href={r.recordHref} className="hover:underline">
      {label}
    </Link>
  ) : (
    label
  );
}

function decisionCell(r: InboxItem, tab: InboxTab) {
  if (r.canDecide) return <InboxDecision requestId={r.id} />;
  if (r.status === "pending" && r.isOwn) {
    return <span className="text-xs text-muted-foreground">Waiting on someone else</span>;
  }
  if (tab === "pending") return <span className="text-xs text-muted-foreground">Can&apos;t decide</span>;
  return (
    <div className="max-w-56 text-right leading-tight">
      <StatusBadge status={r.status} />
      {r.reason && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">&ldquo;{r.reason}&rdquo;</p>}
    </div>
  );
}

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePagePermission("approvals:view");
  const sp = await searchParams;
  const tab = parseInboxTab(sp.tab);
  const params = parseTableParams(sp, {
    sortable: INBOX_SORTABLE,
    defaultSort: "createdAt",
    defaultDir: tab === "pending" ? "asc" : "desc",
    filters: ["tool"],
  });
  const [{ rows, total }, tools] = await Promise.all([
    listInbox(user, { tab, tool: params.filters.tool, sort: params.sort, dir: params.dir, skip: params.skip, take: params.take }),
    inboxTools(user),
  ]);

  const columns: DataTableColumn[] = [
    { id: "tool", header: "Tool", sortable: true },
    { id: "what", header: "What" },
    { id: "amountCents", header: "Amount", sortable: true, align: "right" },
    { id: "requestedBy", header: "Requested by" },
    { id: "createdAt", header: tab === "pending" ? "Age" : "Requested", sortable: true },
    ...(tab === "decided" ? [{ id: "decidedAt", header: "Decided" }] : []),
    { id: "decision", header: tab === "pending" ? "Decide" : "Outcome", align: "right" as const },
  ];

  const tableRows: DataTableRow[] = rows.map((r) => ({
    id: r.id,
    cells: {
      tool: <span className="text-sm">{r.toolName}</span>,
      what: what(r),
      amountCents: r.amountCents != null ? <Money cents={r.amountCents} /> : <span className="text-muted-foreground">—</span>,
      requestedBy: (
        <span>
          {r.requestedByName}
          {r.isOwn && <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">you</span>}
        </span>
      ),
      createdAt: <RelativeTime date={r.createdAt} />,
      decidedAt: r.decidedAt ? <RelativeTime date={r.decidedAt} /> : null,
      decision: decisionCell(r, tab),
    },
  }));

  return (
    <div>
      <PageHeader
        title="Approvals"
        description="Every request that needs a second person, across all tools. You can't decide your own."
        actions={
          <Link href="/insights" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <BarChart3 /> Insights
          </Link>
        }
      />
      <nav className="mb-4 flex gap-1 border-b" aria-label="Inbox views">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === "pending" ? "/approvals" : `/approvals?tab=${t.id}`}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              t.id === tab ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.id === "pending" && tab === "pending" && total > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">{total}</span>
            )}
          </Link>
        ))}
      </nav>
      <DataTable
        columns={columns}
        rows={tableRows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        sort={params.sort}
        dir={params.dir}
        filterValues={params.filters}
        filters={tools.length > 1 ? [{ id: "tool", label: "Tool", type: "select", options: tools.map((t) => ({ label: t, value: t })) }] : []}
        emptyState={<EmptyState {...EMPTY[tab]} />}
      />
    </div>
  );
}
