import { TrendingUp } from "lucide-react";
import Link from "next/link";
import { requirePagePermission } from "@/platform/auth";
import { loadImpact } from "@/platform/requests";
import { STATUS_LABELS, type DisplayStatus } from "@/platform/requests/status";
import { EmptyState } from "@/platform/ui/EmptyState";
import { PageHeader } from "@/platform/ui/PageHeader";
import { RelativeTime } from "@/platform/ui/RelativeTime";
import { StatCards } from "@/platform/ui/StatCards";
import { Explained, kindLabel, RequestStatusBadge } from "../components";
import { toolLabel } from "@/platform/ui/labels";

const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n >= 1000 ? 0 : 2 }).format(n);

export default async function ImpactPage() {
  await requirePagePermission("admin:read");
  const { impact, requests } = await loadImpact();
  const shipped = requests.filter((r) => r.display === "merged");
  const statuses = (Object.keys(impact.byStatus) as DisplayStatus[]).filter((s) => impact.byStatus[s] > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Build with Devin: impact"
        description="What the request center has delivered, what it cost, and what the same users would cost on Power Apps. Hover a number to see how it's computed."
      />

      <StatCards
        items={[
          {
            label: "Requests",
            value: impact.total,
            hint: `${impact.shipped} shipped`,
          },
          {
            label: "Hours saved per week",
            value: <Explained formula={impact.formulas.hours}>{impact.hoursSavedPerWeek}</Explained>,
            hint: `≈ ${Math.round(impact.hoursSavedPerWeek * 52)} hours a year`,
          },
          {
            label: "Devin usage",
            value: <Explained formula={impact.formulas.acus}>{impact.totalAcus} ACUs</Explained>,
            hint: <Explained formula={impact.formulas.acuCost}>{impact.acuCost == null ? "Cost: set DEVIN_ACU_PRICE" : `${usd(impact.acuCost)} total`}</Explained>,
          },
          {
            label: "Equivalent Power Apps seats",
            value: <Explained formula={impact.formulas.seatCost}>{`${usd(impact.seatCostMonthly)}/mo`}</Explained>,
            hint: <Explained formula={impact.formulas.seats}>{`${impact.seatUsers} users · ${usd(impact.seatCostAnnual)}/yr`}</Explained>,
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="rounded-lg border bg-card">
          <h2 className="border-b px-4 py-2.5 text-sm font-semibold">Requests by status</h2>
          {statuses.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {statuses.map((s) => (
                <li key={s} className="flex items-center justify-between px-4 py-2">
                  <span>{STATUS_LABELS[s]}</span>
                  <span className="font-medium tabular-nums">{impact.byStatus[s]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border bg-card lg:col-span-2">
          <h2 className="border-b px-4 py-2.5 text-sm font-semibold">Shipped</h2>
          {shipped.length === 0 ? (
            <EmptyState className="m-4" icon={<TrendingUp />} title="Nothing shipped yet" description="Merged requests show up here with the time they save." />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2 font-medium">Request</th>
                  <th className="px-4 py-2 font-medium">Requested by</th>
                  <th className="px-4 py-2 text-right font-medium">Hours/week saved</th>
                  <th className="px-4 py-2 text-right font-medium">ACUs</th>
                  <th className="px-4 py-2 text-right font-medium">Shipped</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shipped.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2">
                      <Link href={`/build/requests/${r.id}`} className="font-medium hover:underline">
                        {r.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {kindLabel(r.kind)}
                        {r.toolSlug && <> · {toolLabel(r.toolSlug)}</>}
                      </p>
                    </td>
                    <td className="px-4 py-2">{r.requestedByName}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.hoursPerWeek ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.acusUsed ?? "—"}</td>
                    <td className="px-4 py-2 text-right">{r.shippedAt ? <RelativeTime date={r.shippedAt} /> : <RequestStatusBadge status={r.display} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold">Build vs. buy, for these tools</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Devin has used <Explained formula={impact.formulas.acus}>{impact.totalAcus} ACUs</Explained>
          {impact.acuCost != null && <> ({usd(impact.acuCost)})</>} across {impact.total} requests. Running the shipped tools (
          {impact.shippedTools.map(toolLabel).join(", ") || "none yet"}) on Power Apps Premium would need{" "}
          <Explained formula={impact.formulas.seats}>{impact.seatUsers} seats</Explained>, about{" "}
          <Explained formula={impact.formulas.seatCost}>{usd(impact.seatCostAnnual)} a year</Explained>. Not counted here: engineer review time, hosting, and
          the ongoing maintenance Keystone now owns.
        </p>
      </section>
    </div>
  );
}
