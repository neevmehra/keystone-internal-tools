import { Activity, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/platform/auth";
import { canViewInsights, dayKey, formatDuration, getInsights, parseRange } from "@/platform/insights";
import { EmptyState } from "@/platform/ui/EmptyState";
import { ActionsPerDayChart, PendingAgeChart } from "@/platform/ui/InsightsCharts";
import { PageHeader } from "@/platform/ui/PageHeader";
import { StatCards } from "@/platform/ui/StatCards";
import type { SearchParams } from "@/platform/ui/table-params";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function PeopleList({ people, empty }: { people: Array<{ name: string; count: number }>; empty: string }) {
  if (people.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...people.map((p) => p.count));
  return (
    <ul className="space-y-2">
      {people.map((p) => (
        <li key={p.name} className="text-sm">
          <div className="flex justify-between">
            <span>{p.name}</span>
            <span className="tabular-nums text-muted-foreground">{p.count}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-primary/70" style={{ width: `${(p.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!canViewInsights(user)) redirect("/forbidden?permission=approvals%3Aview");
  const sp = await searchParams;
  const now = new Date();
  const range = parseRange(one(sp.from), one(sp.to), now);
  const data = await getInsights(range, now);
  const { decided, selfDecided } = data.separation;
  const stale = data.pendingByAge.find((b) => b.id === "gt3d")?.count ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Insights"
        description="How approvals flow across every tool, computed live from the approvals records and the audit log."
        actions={
          <form className="flex items-end gap-2" action="/insights">
            <label className="text-xs text-muted-foreground">
              From
              <Input type="date" name="from" defaultValue={dayKey(range.from)} className="mt-0.5 h-8 w-36 text-xs" />
            </label>
            <label className="text-xs text-muted-foreground">
              To
              <Input type="date" name="to" defaultValue={dayKey(range.to)} className="mt-0.5 h-8 w-36 text-xs" />
            </label>
            <Button type="submit" size="sm" variant="outline" className="h-8">
              Apply
            </Button>
          </form>
        }
      />

      <StatCards
        items={[
          { label: "Pending now", value: data.pendingTotal, hint: stale ? `${stale} waiting over 3 days` : "None waiting over 3 days" },
          { label: "Decided in range", value: decided },
          { label: "Median time to decision", value: formatDuration(data.overallMedianMs), hint: "All tools, decided in range" },
          { label: "Actions logged", value: data.eventsTotal.toLocaleString("en-US"), hint: data.eventsCapped ? "Capped; narrow the range" : "Excluding sign-ins" },
        ]}
      />

      <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-700" />
        <div>
          <p className="text-sm font-semibold text-emerald-900">
            {decided.toLocaleString("en-US")} approvals decided, {selfDecided} self-approved
          </p>
          <p className="text-xs text-emerald-800/80">
            Separation of duties, computed from every decided request in the range: the requester and the decider are compared on each record.
            The approvals engine blocks self-approval, so this should always read 0.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Time to decision by tool" description="Median and p90, from request to approve or reject.">
          {data.decisionTimes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No decisions in this range.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Tool</th>
                  <th className="pb-2 text-right font-medium">Decided</th>
                  <th className="pb-2 text-right font-medium">Median</th>
                  <th className="pb-2 text-right font-medium">p90</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.decisionTimes.map((d) => (
                  <tr key={d.tool}>
                    <td className="py-2">{d.toolName}</td>
                    <td className="py-2 text-right tabular-nums">{d.decided}</td>
                    <td className="py-2 text-right tabular-nums">{formatDuration(d.medianMs)}</td>
                    <td className="py-2 text-right tabular-nums">{formatDuration(d.p90Ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Pending approvals by age" description="Everything still waiting, regardless of the date range.">
          <PendingAgeChart data={data.pendingByAge} />
        </Panel>
      </div>

      <Panel title="Actions per tool per day" description="Audit events by tool, UTC days.">
        {data.daily.tools.length === 0 ? (
          <EmptyState icon={<Activity />} title="No activity in this range" description="Actions in any tool show up here as they happen." />
        ) : (
          <ActionsPerDayChart points={data.daily.points} tools={data.daily.tools} labels={data.daily.labels} />
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Top requesters" description="Approval requests created in the range.">
          <PeopleList people={data.topRequesters} empty="No requests in this range." />
        </Panel>
        <Panel title="Top deciders" description="Approvals and rejections made in the range.">
          <PeopleList people={data.topDeciders} empty="No decisions in this range." />
        </Panel>
      </div>
    </div>
  );
}
