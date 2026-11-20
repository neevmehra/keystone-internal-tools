/**
 * Chargebacks on the cross-tool customer page and in global search. Reads only.
 */
import Link from "next/link";
import type { CustomerPanel } from "@/platform/manifest";
import { db } from "@/platform/db";
import { formatCurrency } from "@/platform/ui/format";
import { RelativeTime } from "@/platform/ui/RelativeTime";
import { StatusBadge } from "@/platform/ui/StatusBadge";
import { manifest } from "./manifest";
import { ACTIVE_STATUSES, LOSS_STATUSES, REASON_LABELS, STATUS_LABELS, type DisputeStatus } from "./rules";

const PANEL_ROWS = 5;

const reasonLabel = (code: string) => REASON_LABELS[code as keyof typeof REASON_LABELS] ?? code;
const statusTone = (s: string) => (s === "won" ? "success" : s === "open" || s === "in_progress" ? "warning" : s === "lost" ? "danger" : "neutral");

export const customerPanels: CustomerPanel[] = [
  {
    tool: manifest.slug,
    title: "Chargebacks",

    async stats({ customerId }) {
      const [open, lost] = await Promise.all([
        db.dispute.aggregate({ where: { customerId, status: { in: [...ACTIVE_STATUSES] } }, _count: true }),
        db.dispute.aggregate({ where: { customerId, status: { in: [...LOSS_STATUSES] } }, _count: true, _sum: { amountCents: true } }),
      ]);
      return [
        {
          label: "Open disputes",
          value: open._count,
          hint: `${formatCurrency(lost._sum.amountCents ?? 0)} lost across ${lost._count} dispute${lost._count === 1 ? "" : "s"}`,
        },
      ];
    },

    async activity({ customerId }, { take }) {
      const [rows, total] = await Promise.all([
        db.dispute.findMany({ where: { customerId }, orderBy: [{ openedAt: "desc" }, { id: "asc" }], take }),
        db.dispute.count({ where: { customerId } }),
      ]);
      return {
        total,
        items: rows.map((d) => ({
          id: `chargebacks:${d.id}`,
          at: d.openedAt,
          tool: manifest.slug,
          kind: "Dispute opened",
          title: `${d.id} at ${d.merchant}`,
          detail: reasonLabel(d.reasonCode),
          amountCents: d.amountCents,
          status: d.status,
          href: `/tools/chargebacks/${d.id}`,
        })),
      };
    },

    async auditEntities({ customerId }) {
      const disputes = await db.dispute.findMany({ where: { customerId }, select: { id: true } });
      const ids = disputes.map((d) => d.id);
      const approvals = ids.length
        ? await db.approvalRequest.findMany({ where: { tool: manifest.slug, entityId: { in: ids } }, select: { id: true } })
        : [];
      return [
        { entityType: "Dispute", entityIds: ids },
        { entityType: "ApprovalRequest", entityIds: approvals.map((a) => a.id) },
      ];
    },

    async search(query) {
      if (!/^dsp_/i.test(query)) return [];
      const rows = await db.dispute.findMany({
        where: { id: { startsWith: query } },
        orderBy: { id: "asc" },
        take: 5,
        select: { id: true, customerId: true, amountCents: true, merchant: true, status: true },
      });
      return rows.map((d) => ({
        id: `chargebacks:${d.id}`,
        type: "Dispute",
        title: d.id,
        subtitle: `${formatCurrency(d.amountCents)} · ${d.merchant} · ${STATUS_LABELS[d.status as DisputeStatus] ?? d.status}`,
        href: `/tools/chargebacks/${d.id}`,
        customerId: d.customerId,
      }));
    },

    async render({ customerId }) {
      const rows = await db.dispute.findMany({ where: { customerId }, orderBy: [{ openedAt: "desc" }, { id: "asc" }], take: PANEL_ROWS });
      if (rows.length === 0) return <p className="text-sm text-muted-foreground">No disputes for this customer.</p>;
      return (
        <ul className="divide-y text-sm">
          {rows.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2">
              <Link href={`/tools/chargebacks/${d.id}`} className="font-mono text-xs text-primary hover:underline">
                {d.id}
              </Link>
              <span className="truncate text-muted-foreground">{reasonLabel(d.reasonCode)}</span>
              <span className="ml-auto tabular-nums">{formatCurrency(d.amountCents)}</span>
              <StatusBadge status={STATUS_LABELS[d.status as DisputeStatus] ?? d.status} tone={statusTone(d.status)} />
              <RelativeTime date={d.openedAt} className="w-20 text-right text-xs text-muted-foreground" />
            </li>
          ))}
        </ul>
      );
    },
  },
];
