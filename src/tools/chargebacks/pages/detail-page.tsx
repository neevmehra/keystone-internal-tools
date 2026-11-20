import { Check, Eye } from "lucide-react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getApprovalsForEntity } from "@/platform/approvals";
import { getEntityHistory } from "@/platform/audit";
import { maskAuditEvent } from "@/platform/audit/masking";
import { requirePagePermission } from "@/platform/auth";
import { hasPermission } from "@/platform/rbac";
import { ActionForm, ApprovalPanel, AuditTimeline, Money, RecordDetail, RelativeTime, formatCurrency } from "@/platform/ui";
import { markDisputeLost, markDisputeWon, pickUpDispute, saveEvidenceNote } from "../actions";
import { manifest } from "../manifest";
import { getDispute, getTransaction } from "../queries";
import { REASON_LABELS, STATUS_LABELS, isActive, type DisputeStatus } from "../rules";
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
  const canSignOff = hasPermission(user, "chargebacks:approve") && approvals[0]?.status === "pending";
  const mine = dispute.assignedToId === user.id;
  const needsSignOff = dispute.amountCents >= (manifest.approvalThresholdCents ?? Infinity);
  // The engine needs approval at or above approvalThresholdCents (50_001), so the limit people read is one cent less.
  const signOffLimit = formatCurrency((manifest.approvalThresholdCents ?? 50_001) - 1);
  const active = isActive(dispute.status);
  const steps = [
    { label: "Pick up", done: !!dispute.assignedToId, current: active && !dispute.assignedToId },
    { label: "Send evidence and add a note", done: !!dispute.evidenceNote, current: active && mine && !dispute.evidenceNote },
    { label: "Record won or lost", done: !active, current: active && mine && !!dispute.evidenceNote },
  ];

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
        <section className="rounded-lg border bg-card">
          <div className={cn("px-4 py-3", canWrite && "border-b")}>
            <h3 className="text-sm font-semibold">{canWrite ? "Work this dispute" : "Your access"}</h3>
            {canWrite ? (
              <ol className="mt-3 space-y-2" aria-label="Steps">
                {steps.map((step, i) => (
                  <li key={step.label} className="flex items-center gap-2.5 text-sm">
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium",
                        step.done ? "border-emerald-300 bg-emerald-50 text-emerald-700" : step.current ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
                      )}
                      aria-hidden
                    >
                      {step.done ? <Check className="size-3" /> : i + 1}
                    </span>
                    <span className={cn(step.done && "text-muted-foreground line-through decoration-muted-foreground/40", step.current && "font-medium")}>{step.label}</span>
                    {step.current && <span className="sr-only">(current step)</span>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-1 flex items-start gap-2 text-sm text-muted-foreground">
                <Eye className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {canSignOff
                    ? "Payments Ops works disputes. Your part is the write-off sign-off below."
                    : `View only. Payments Ops works disputes; finance signs off on write-offs over ${signOffLimit}.`}
                </span>
              </p>
            )}
          </div>

          {canWrite && (
            <div className="space-y-4 px-4 py-4">
              {!isActive(dispute.status) ? (
                <p className="text-sm">
                  Resolved: <span className="font-medium">{STATUS_LABELS[dispute.status as DisputeStatus] ?? dispute.status}</span>
                  {dispute.resolvedAt && (
                    <span className="text-muted-foreground">
                      {" "}
                      · <RelativeTime date={dispute.resolvedAt} />
                    </span>
                  )}
                </p>
              ) : !dispute.assignedToId ? (
                <>
                  <p className="text-sm text-muted-foreground">Pick it up so the rest of the team knows it&apos;s taken.</p>
                  <ActionForm action={pickUpDispute} hidden={{ disputeId: dispute.id }} fields={[]} submitLabel="Pick up" successMessage="Dispute is yours" />
                </>
              ) : !mine ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{dispute.assignedToName}</span> is working this dispute. Only the assignee can add evidence or record the outcome.
                </p>
              ) : (
                <>
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
                    submitLabel={dispute.evidenceNote ? "Update note" : "Save note"}
                    successMessage="Evidence note saved"
                    variant={dispute.evidenceNote ? "outline" : "default"}
                  />
                  <div className="space-y-2 border-t pt-4">
                    <p className="text-xs font-medium">Outcome</p>
                    <p className="text-xs text-muted-foreground">
                      {needsSignOff
                        ? `If we lost, the ${formatCurrency(dispute.amountCents)} write-off goes to finance for sign-off.`
                        : `If we lost, it's written off right away (under the ${signOffLimit} sign-off limit).`}
                    </p>
                    {dispute.evidenceNote ? (
                      <div className="flex flex-wrap gap-2">
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
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-2">
                          <Button disabled>Mark won</Button>
                          <Button variant="destructive" disabled>
                            Mark lost
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">Save an evidence note first.</p>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {approvals[0] && <ApprovalPanel request={approvals[0]} user={user} />}
      </div>
    </div>
  );
}
