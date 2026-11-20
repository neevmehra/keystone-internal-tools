import { ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/platform/auth";
import {
  canViewCustomers,
  getCustomer,
  getCustomerStats,
  getCustomerTimeline,
  panelsForUser,
  recordCustomerView,
} from "@/platform/customers";
import { hasPermission } from "@/platform/rbac";
import { getTool } from "@/platform/registry";
import { EmptyState } from "@/platform/ui/EmptyState";
import { formatCurrency } from "@/platform/ui/format";
import { toolLabel } from "@/platform/ui/labels";
import { RecordDetail } from "@/platform/ui/RecordDetail";
import { RelativeTime } from "@/platform/ui/RelativeTime";
import { StatCards } from "@/platform/ui/StatCards";
import { StatusBadge } from "@/platform/ui/StatusBadge";
import { ToolIcon } from "@/platform/ui/ToolIcon";
import { cn } from "@/lib/utils";

const formatDate = (d: Date) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(d);

/** Where an activity row came from, in words: "Card", "Refunds", "Platform". */
const sourceLabel = (item: { id: string; tool: string }) => (item.id.startsWith("platform:") ? "Card" : toolLabel(item.tool));

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function CustomerPage({ params, searchParams }: PageProps<"/customers/[id]">) {
  const user = await requireUser();
  if (!canViewCustomers(user)) redirect("/forbidden");
  const { id } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Math.floor(Number(first(sp.page)) || 1));

  const customer = await getCustomer(user, id);
  if (!customer) notFound();
  await recordCustomerView(user, customer.id);

  const ctx = { customerId: customer.id, user };
  const panels = panelsForUser(user);
  const [stats, timeline, panelBodies] = await Promise.all([
    getCustomerStats(user, customer.id),
    getCustomerTimeline(user, customer.id, page),
    Promise.all(panels.map((p) => p.render(ctx))),
  ]);
  const pages = Math.max(1, Math.ceil(timeline.total / timeline.pageSize));
  const canSeePii = hasPermission(user, "pii:read");

  return (
    <div className="space-y-5">
      <RecordDetail
        title={
          <span className="flex items-center gap-2">
            <UserRound className="size-4 text-muted-foreground" />
            {customer.name}
          </span>
        }
        subtitle={customer.id}
        status={<StatusBadge status={customer.status} />}
        fields={[
          { label: "Email", value: customer.email },
          { label: "Phone", value: customer.phone },
          { label: "Country", value: customer.country },
          { label: "Risk tier", value: <StatusBadge status={customer.riskTier} /> },
          { label: "Customer since", value: formatDate(customer.createdAt) },
          {
            label: "Personal data",
            value: canSeePii ? "Visible to you" : <span className="text-muted-foreground">Masked: your role doesn&apos;t include PII access</span>,
          },
        ]}
      />

      <StatCards items={stats} />

      {panels.length > 0 && (
        <div className={cn("grid gap-4", panels.length > 1 && "lg:grid-cols-2")}>
          {panels.map((p, i) => {
            const tool = getTool(p.tool);
            return (
              <section key={p.tool} className="min-w-0 rounded-lg border bg-card">
                <header className="flex items-center gap-2 border-b px-4 py-3">
                  {tool && <ToolIcon name={tool.icon} />}
                  <h2 className="text-sm font-semibold">{p.title}</h2>
                  {tool && (
                    <Link
                      href={tool.nav[0]?.href ?? `/tools/${tool.slug}`}
                      className="-my-1 ml-auto inline-flex min-h-8 items-center rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      Open {tool.name}
                    </Link>
                  )}
                </header>
                <div className="px-4 py-2">{panelBodies[i]}</div>
              </section>
            );
          })}
        </div>
      )}

      <section className="rounded-lg border bg-card">
        <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Activity</h2>
            <p className="text-xs text-muted-foreground">Card transactions, tool records and their history, newest first.</p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{timeline.total} events</span>
        </header>
        {timeline.items.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No activity yet" description="This customer has no transactions or tool records." />
          </div>
        ) : (
          <ol className="divide-y">
            {timeline.items.map((item) => {
              const source = sourceLabel(item);
              const body = (
                <div className="flex items-start gap-3 px-4 py-2.5 text-sm">
                  <span className="mt-0.5 hidden w-24 shrink-0 truncate text-xs text-muted-foreground sm:block">{source}</span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words">
                      <span className="font-medium">{item.kind}</span>
                      {item.title && <span className="text-muted-foreground"> · {item.title}</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground" title={item.detail}>
                      <span className="sm:hidden">{source}</span>
                      {item.detail && <span className="before:content-['_·_'] sm:before:content-none">{item.detail}</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                    {item.amountCents !== undefined && <span className="tabular-nums">{formatCurrency(item.amountCents)}</span>}
                    {item.status && <StatusBadge status={item.status} />}
                    <RelativeTime date={item.at} className="whitespace-nowrap text-xs text-muted-foreground sm:w-24 sm:text-right" />
                  </div>
                </div>
              );
              return (
                <li key={item.id}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="block hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset"
                    >
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {pages > 1 && (
          <footer className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
            <span>
              Page {timeline.page} of {pages}
            </span>
            <div className="flex items-center gap-1">
              {timeline.page > 1 ? (
                <Link href={`/customers/${customer.id}?page=${timeline.page - 1}`} className="inline-flex items-center rounded-md px-2 py-1 hover:bg-muted">
                  <ChevronLeft className="size-3.5" /> Newer
                </Link>
              ) : null}
              {timeline.page < pages ? (
                <Link href={`/customers/${customer.id}?page=${timeline.page + 1}`} className="inline-flex items-center rounded-md px-2 py-1 hover:bg-muted">
                  Older <ChevronRight className="size-3.5" />
                </Link>
              ) : null}
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}
