import { ArrowUpRight, BarChart3, CheckCheck, Inbox, Send } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { INBOX_SORTABLE, inboxTools, listInbox, parseInboxTab, type InboxItem, type InboxTab } from "@/platform/approvals/inbox";
import { requirePagePermission } from "@/platform/auth";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/platform/ui/DataTable";
import { EmptyState } from "@/platform/ui/EmptyState";
import { formatCurrency } from "@/platform/ui/format";
import { humanize, toolLabel } from "@/platform/ui/labels";
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

/** Where the approver can see the full record before deciding. */
function recordLink(r: InboxItem): string | null {
  if (r.recordHref) return r.recordHref;
  if (r.entityType === "ToolRequest") return `/build/requests/${encodeURIComponent(r.entityId)}`;
  return null;
}

function whatLabel(r: InboxItem) {
  return humanize(r.actionType.split(".").pop() ?? r.actionType);
}

function what(r: InboxItem) {
  const href = recordLink(r);
  const body = (
    <span className="block leading-tight">
      <span className="flex items-center gap-1 font-medium text-foreground group-hover:text-primary group-hover:underline">
        {whatLabel(r)}
        {href && <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />}
      </span>
      <span className="block max-w-56 truncate font-mono text-[11px] text-muted-foreground" title={`${r.entityType} ${r.entityId}`}>
        {humanize(r.entityType)} {r.entityId}
      </span>
    </span>
  );
  return href ? (
    <Link
      href={href}
      className="group -mx-1 -my-0.5 block rounded-sm px-1 py-0.5 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
      title="Open the record to check it before deciding"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

function decisionCell(r: InboxItem, tab: InboxTab) {
  if (r.canDecide) {
    const amount = r.amountCents != null ? ` ${formatCurrency(r.amountCents)}` : "";
    return <InboxDecision requestId={r.id} summary={`${whatLabel(r)}${amount} for ${r.requestedByName}`} />;
  }
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
      tool: <span className="whitespace-nowrap">{toolLabel(r.tool)}</span>,
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
        label="Approvals"
        columns={columns}
        rows={tableRows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        sort={params.sort}
        dir={params.dir}
        filterValues={params.filters}
        filters={tools.length > 1 ? [{ id: "tool", label: "Tool", type: "select", options: tools.map((t) => ({ label: toolLabel(t), value: t })) }] : []}
        emptyState={<EmptyState {...EMPTY[tab]} />}
      />
    </div>
  );
}
