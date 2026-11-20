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
import { formatAbsolute, formatCurrency, humanize } from "@/platform/ui/format";
import { RecordDetail } from "@/platform/ui/RecordDetail";
import { RelativeTime } from "@/platform/ui/RelativeTime";
import { StatCards } from "@/platform/ui/StatCards";
import { StatusBadge } from "@/platform/ui/StatusBadge";
import { ToolIcon } from "@/platform/ui/ToolIcon";

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
          { label: "Customer since", value: formatAbsolute(customer.createdAt) },
          {
            label: "Personal data",
            value: canSeePii ? "Visible to you" : <span className="text-muted-foreground">Masked: your role doesn&apos;t include PII access</span>,
          },
        ]}
      />

      <StatCards items={stats} />

      {panels.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {panels.map((p, i) => {
            const tool = getTool(p.tool);
            return (
              <section key={p.tool} className="rounded-lg border bg-card">
                <header className="flex items-center gap-2 border-b px-4 py-3">
                  {tool && <ToolIcon name={tool.icon} />}
                  <h2 className="text-sm font-semibold">{p.title}</h2>
                  {tool && (
                    <Link href={tool.nav[0]?.href ?? `/tools/${tool.slug}`} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
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
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Activity</h2>
            <p className="text-xs text-muted-foreground">Card transactions, tool records and their history, newest first.</p>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{timeline.total} events</span>
        </header>
        {timeline.items.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No activity yet" description="This customer has no transactions or tool records." />
          </div>
        ) : (
          <ol className="divide-y">
            {timeline.items.map((item) => {
              const body = (
                <div className="flex items-start gap-3 px-4 py-2.5 text-sm">
                  <span className="mt-0.5 w-28 shrink-0 font-mono text-[11px] text-muted-foreground">{item.tool === "platform" ? "card" : item.tool}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      <span className="font-medium">{item.kind}</span>
                      <span className="text-muted-foreground"> · {item.title}</span>
                    </p>
                    {item.detail && <p className="truncate text-xs text-muted-foreground">{item.detail}</p>}
                  </div>
                  {item.amountCents !== undefined && <span className="tabular-nums">{formatCurrency(item.amountCents)}</span>}
                  {item.status && <StatusBadge status={humanize(item.status)} />}
                  <RelativeTime date={item.at} className="w-24 shrink-0 text-right text-xs text-muted-foreground" />
                </div>
              );
              return (
                <li key={item.id}>
                  {item.href ? (
                    <Link href={item.href} className="block hover:bg-muted/40">
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
