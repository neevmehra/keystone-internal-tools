import { notFound } from "next/navigation";
import { getApprovalsForEntity } from "@/platform/approvals";
import { getEntityHistory } from "@/platform/audit";
import { maskAuditEvent } from "@/platform/audit/masking";
import { requirePagePermission } from "@/platform/auth";
import { hasPermission } from "@/platform/rbac";
import { ActionForm, ApprovalPanel, AuditTimeline, Money, RecordDetail, RelativeTime, formatCurrency } from "@/platform/ui";
import { markDisputeLost, markDisputeWon, pickUpDispute, saveEvidenceNote } from "../actions";
import { manifest } from "../manifest";
import { getDispute, getTransaction } from "../queries";
import { REASON_LABELS, isActive } from "../rules";
import { DeadlineBadge } from "./DeadlineBadge";
import { DisputeStatusBadge } from "./queue-page";

export async function DetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission(manifest.readPermission);
  const { id } = await params;
  const dispute = await getDispute(user, id);
  if (!dispute) notFound();
  const [history, approvals, txn] = await Promise.all([
    getEntityHistory("Dispute", id),
    getApprovalsForEntity("Dispute", id),
    getTransaction(dispute.transactionId),
  ]);

  const canWrite = hasPermission(user, "chargebacks:write");
  const mine = dispute.assignedToId === user.id;
  const working = dispute.status === "in_progress" && mine;
  const needsSignOff = dispute.amountCents >= (manifest.approvalThresholdCents ?? Infinity);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <RecordDetail
          title={`Dispute ${dispute.id}`}
          subtitle={`Transaction ${dispute.transactionId}`}
          status={<DisputeStatusBadge status={dispute.status} />}
          fields={[
            { label: "Amount", value: <Money cents={dispute.amountCents} currency={dispute.currency} /> },
            { label: "Respond by", value: <DeadlineBadge status={dispute.status} respondBy={dispute.respondBy} /> },
            { label: "Reason", value: REASON_LABELS[dispute.reasonCode as keyof typeof REASON_LABELS] ?? dispute.reasonCode },
            { label: "Customer", value: dispute.customerEmail },
            { label: "Customer ID", value: <span className="font-mono text-xs">{dispute.customerId}</span> },
            { label: "Card", value: `${dispute.network === "visa" ? "Visa" : "Mastercard"} •••• ${dispute.cardLast4}` },
            { label: "Merchant", value: txn ? `${txn.merchant} (${txn.category})` : dispute.merchant },
            { label: "Charged", value: txn ? <RelativeTime date={txn.createdAt} /> : null },
            { label: "Dispute opened", value: <RelativeTime date={dispute.openedAt} /> },
            { label: "Assigned to", value: dispute.assignedToName ?? <span className="text-muted-foreground">Unassigned</span> },
            { label: "Resolved", value: dispute.resolvedAt ? <RelativeTime date={dispute.resolvedAt} /> : null },
            { label: "Written off", value: dispute.writtenOffAt ? <RelativeTime date={dispute.writtenOffAt} /> : null },
          ]}
        >
          <h3 className="text-xs font-medium text-muted-foreground">Evidence sent</h3>
          {dispute.evidenceNote ? (
            <p className="mt-1 text-sm whitespace-pre-wrap">{dispute.evidenceNote}</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">No evidence note yet.</p>
          )}
        </RecordDetail>
        <section className="rounded-lg border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold">History</h3>
          <AuditTimeline events={history.map((e) => maskAuditEvent(e, user))} />
        </section>
      </div>

      <div className="space-y-5">
        {canWrite && isActive(dispute.status) && !mine && (
          <section className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold">Work this dispute</h3>
            {dispute.assignedToName ? (
              <p className="mt-1 text-sm text-muted-foreground">{dispute.assignedToName} is working this dispute.</p>
            ) : (
              <>
                <p className="mt-1 mb-3 text-sm text-muted-foreground">Pick it up so the rest of the team knows it&apos;s taken.</p>
                <ActionForm action={pickUpDispute} hidden={{ disputeId: dispute.id }} fields={[]} submitLabel="Pick up" successMessage="Dispute is yours" />
              </>
            )}
          </section>
        )}

        {canWrite && working && (
          <>
            <section className="rounded-lg border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold">Evidence note</h3>
              <ActionForm
                action={saveEvidenceNote}
                hidden={{ disputeId: dispute.id }}
                fields={[
                  {
                    name: "evidenceNote",
                    label: "What evidence did you send?",
                    type: "textarea",
                    required: true,
                    defaultValue: dispute.evidenceNote ?? "",
                    placeholder: "e.g. Delivery confirmation with signature, customer emails from Oct 3",
                  },
                ]}
                submitLabel="Save note"
                successMessage="Evidence note saved"
              />
            </section>
            <section className="space-y-3 rounded-lg border bg-card p-4">
              <h3 className="text-sm font-semibold">Outcome</h3>
              <p className="text-sm text-muted-foreground">
                {needsSignOff
                  ? `If we lost, the ${formatCurrency(dispute.amountCents)} write-off goes to finance (Dan or Priya) for sign-off.`
                  : "If we lost, it's written off right away (under the $500 sign-off limit)."}
              </p>
              <div className="flex gap-2">
                <ActionForm action={markDisputeWon} hidden={{ disputeId: dispute.id }} fields={[]} submitLabel="Mark won" successMessage="Marked won" />
                <ActionForm
                  action={markDisputeLost}
                  hidden={{ disputeId: dispute.id }}
                  fields={[]}
                  submitLabel="Mark lost"
                  variant="destructive"
                  successMessage={needsSignOff ? "Marked lost. Write-off sent to finance." : "Marked lost and written off"}
                />
              </div>
            </section>
          </>
        )}

        <ApprovalPanel request={approvals[0]} user={user} />
      </div>
    </div>
  );
}
