/**
 * Refunds on the cross-tool customer page and in global search. Reads only.
 */
import Link from "next/link";
import type { CustomerPanel, CustomerPanelContext } from "@/platform/manifest";
import { db } from "@/platform/db";
import { formatCurrency, humanize } from "@/platform/ui/format";
import { RelativeTime } from "@/platform/ui/RelativeTime";
import { StatusBadge } from "@/platform/ui/StatusBadge";
import { manifest } from "./manifest";
import { effectiveStatus } from "./queries";

const PANEL_ROWS = 5;

async function refundsWithStatus(customerId: string, take?: number) {
  const refunds = await db.refund.findMany({ where: { customerId }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take });
  const approvals = refunds.length
    ? await db.approvalRequest.findMany({
        where: { tool: manifest.slug, entityType: "Refund", entityId: { in: refunds.map((r) => r.id) } },
      })
    : [];
  const byRefund = new Map(approvals.map((a) => [a.entityId, a]));
  return refunds.map((r) => ({ ...r, approval: byRefund.get(r.id) ?? null, effectiveStatus: effectiveStatus(r, byRefund.get(r.id)) }));
}

export const customerPanels: CustomerPanel[] = [
  {
    tool: manifest.slug,
    title: "Refunds",

    async stats({ customerId }: CustomerPanelContext) {
      const [all, executed] = await Promise.all([
        db.refund.aggregate({ where: { customerId }, _count: true, _sum: { amountCents: true } }),
        db.refund.aggregate({ where: { customerId, status: "executed" }, _sum: { amountCents: true } }),
      ]);
      return [
        {
          label: "Refunds",
          value: all._count,
          hint: `${formatCurrency(executed._sum.amountCents ?? 0)} refunded of ${formatCurrency(all._sum.amountCents ?? 0)} requested`,
        },
      ];
    },

    async activity({ customerId }, { take }) {
      const [rows, total] = await Promise.all([refundsWithStatus(customerId, take), db.refund.count({ where: { customerId } })]);
      return {
        total,
        items: rows.map((r) => ({
          id: `refunds:${r.id}`,
          at: r.createdAt,
          tool: manifest.slug,
          kind: "Refund requested",
          title: `${r.id} by ${r.requestedByName}`,
          detail: humanize(r.reason),
          amountCents: r.amountCents,
          status: r.effectiveStatus,
          href: `/tools/refunds/${r.id}`,
        })),
      };
    },

    async auditEntities({ customerId }) {
      const refunds = await db.refund.findMany({ where: { customerId }, select: { id: true, approvalRequestId: true } });
      return [
        { entityType: "Refund", entityIds: refunds.map((r) => r.id) },
        { entityType: "ApprovalRequest", entityIds: refunds.flatMap((r) => (r.approvalRequestId ? [r.approvalRequestId] : [])) },
      ];
    },

    async search(query) {
      if (!/^ref_/i.test(query)) return [];
      const rows = await db.refund.findMany({
        where: { id: { startsWith: query } },
        orderBy: { id: "asc" },
        take: 5,
        select: { id: true, customerId: true, amountCents: true, reason: true, createdAt: true },
      });
      return rows.map((r) => ({
        id: `refunds:${r.id}`,
        type: "Refund",
        title: r.id,
        subtitle: `${formatCurrency(r.amountCents)} · ${humanize(r.reason)}`,
        href: `/tools/refunds/${r.id}`,
        customerId: r.customerId,
      }));
    },

    async render({ customerId }) {
      const rows = await refundsWithStatus(customerId, PANEL_ROWS);
      if (rows.length === 0) return <p className="text-sm text-muted-foreground">No refunds for this customer.</p>;
      return (
        <ul className="divide-y text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <Link href={`/tools/refunds/${r.id}`} className="shrink-0 font-mono text-xs text-primary hover:underline">
                {r.id}
              </Link>
              <span className="min-w-0 flex-1 truncate text-muted-foreground" title={humanize(r.reason)}>{humanize(r.reason)}</span>
              <span className="tabular-nums">{formatCurrency(r.amountCents)}</span>
              <StatusBadge status={r.effectiveStatus} />
              <RelativeTime date={r.createdAt} className="w-20 shrink-0 text-right text-xs text-muted-foreground" />
            </li>
          ))}
        </ul>
      );
    },
  },
];
