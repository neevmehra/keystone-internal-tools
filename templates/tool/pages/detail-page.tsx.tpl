import { notFound } from "next/navigation";
import { getApprovalsForEntity } from "@/platform/approvals";
import { getEntityHistory } from "@/platform/audit";
import { maskAuditEvent } from "@/platform/audit/masking";
import { requirePagePermission } from "@/platform/auth";
import { hasPermission } from "@/platform/rbac";
import { ActionForm, ApprovalPanel, AuditTimeline, RecordDetail, RelativeTime, StatusBadge } from "@/platform/ui";
import { setRiskTier } from "../actions";
import { manifest } from "../manifest";
import { getRecord } from "../queries";

export async function DetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission(manifest.readPermission);
  const { id } = await params;
  const record = await getRecord(user, id);
  if (!record) notFound();
  const [history, approvals] = await Promise.all([getEntityHistory("Customer", id), getApprovalsForEntity("Customer", id)]);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <RecordDetail
          title={record.name}
          subtitle={record.id}
          status={<StatusBadge status={record.status} />}
          fields={[
            { label: "Email", value: record.email },
            { label: "Phone", value: record.phone },
            { label: "Country", value: record.country },
            { label: "Risk tier", value: <StatusBadge status={record.riskTier} /> },
            { label: "Customer since", value: <RelativeTime date={record.createdAt} /> },
          ]}
        />
        <section className="rounded-lg border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold">History</h3>
          <AuditTimeline events={history.map((e) => maskAuditEvent(e, user))} />
        </section>
      </div>
      <div className="space-y-5">
        <ApprovalPanel request={approvals[0]} user={user} />
        {hasPermission(user, "__SLUG__:write") && (
          <section className="rounded-lg border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">Set risk tier</h3>
            <ActionForm
              action={setRiskTier}
              hidden={{ customerId: record.id }}
              fields={[{ name: "riskTier", label: "Risk tier", type: "select", required: true, defaultValue: record.riskTier, options: ["low", "medium", "high"].map((v) => ({ label: v, value: v })) }]}
              successMessage="Risk tier updated"
            />
          </section>
        )}
      </div>
    </div>
  );
}
