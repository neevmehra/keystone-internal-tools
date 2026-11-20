import { Zap } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEntityHistory } from "@/platform/audit";
import { maskAuditEvent } from "@/platform/audit/masking";
import { requirePagePermission } from "@/platform/auth";
import { hasPermission } from "@/platform/rbac";
import { ActionForm, ApprovalPanel, AuditTimeline, Money, RecordDetail, RelativeTime, StatusBadge, humanize } from "@/platform/ui";
import { retryRefund } from "../actions";
import { manifest } from "../manifest";
import { getRefund } from "../queries";

export async function DetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission(manifest.readPermission);
  const { id } = await params;
  const refund = await getRefund(user, id);
  if (!refund) notFound();

  const [refundHistory, approvalHistory] = await Promise.all([
    getEntityHistory("Refund", refund.id),
    refund.approval ? getEntityHistory("ApprovalRequest", refund.approval.id) : Promise.resolve([]),
  ]);
  const history = [...refundHistory, ...approvalHistory]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
    .map((e) => maskAuditEvent(e, user));

  const txn = refund.transaction;
  const lastError = refund.approval?.lastError ?? refund.lastError;
  const canRetry = !refund.requiresApproval && refund.effectiveStatus === "failed" && hasPermission(user, "refunds:request");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <Link href="/tools/refunds" className="-mx-1 inline-flex min-h-8 items-center rounded px-1 hover:bg-muted hover:text-foreground">
          Refunds
        </Link>{" "}
        / <span className="font-mono text-xs">{refund.id}</span>
      </p>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <RecordDetail
            title={<Money cents={refund.amountCents} currency={refund.currency} />}
            subtitle={refund.id}
            status={<StatusBadge status={refund.effectiveStatus} />}
            fields={[
              { label: "Customer", value: refund.customerName ?? refund.customerId },
              { label: "Customer email", value: refund.customerEmail },
              { label: "Reason", value: humanize(refund.reason) },
              { label: "Requested by", value: refund.requestedByName },
              { label: "Requested", value: <RelativeTime date={refund.createdAt} /> },
              { label: "Executed", value: refund.executedAt ? <RelativeTime date={refund.executedAt} /> : null },
              { label: "Provider refund ID", value: refund.paymentRefundId && <span className="font-mono text-xs">{refund.paymentRefundId}</span> },
              { label: "Idempotency key", value: <span className="font-mono text-xs">{refund.idempotencyKey}</span> },
              { label: "Note", value: refund.note, wide: true },
            ]}
          />
          {txn && (
            <RecordDetail
              title="Original transaction"
              subtitle={txn.id}
              status={<StatusBadge status={txn.status} />}
              fields={[
                { label: "Amount", value: <Money cents={txn.amountCents} currency={txn.currency} /> },
                { label: "Merchant", value: txn.merchant },
                { label: "Category", value: txn.category },
                { label: "Card", value: `•••• ${txn.cardLast4}` },
                { label: "Date", value: <RelativeTime date={txn.createdAt} /> },
                {
                  label: "Refund share",
                  value: `${Math.round((refund.amountCents / txn.amountCents) * 100)}% of the original`,
                },
              ]}
            />
          )}
          <section className="rounded-lg border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold">History</h3>
            <AuditTimeline events={history} />
          </section>
        </div>
        <div className="space-y-5">
          {refund.requiresApproval ? (
            <ApprovalPanel request={refund.approval} user={user} />
          ) : (
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2">
                <Zap className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">No approval needed</h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                $100.00 or less, so this refund executed as soon as it was requested.
              </p>
            </div>
          )}
          {lastError && refund.effectiveStatus === "failed" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-medium">The payments provider returned an error</p>
              <p className="mt-1">{lastError}</p>
              <p className="mt-2 text-xs">Retrying reuses the same idempotency key, so the customer can never be refunded twice.</p>
            </div>
          )}
          {canRetry && (
            <section className="rounded-lg border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold">Retry refund</h3>
              <ActionForm action={retryRefund} hidden={{ refundId: refund.id }} fields={[]} submitLabel="Retry refund" successMessage="Retry finished" />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
