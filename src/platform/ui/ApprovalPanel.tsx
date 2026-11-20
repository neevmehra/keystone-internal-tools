import type { ApprovalRequest } from "@prisma/client";
import { ShieldCheck } from "lucide-react";
import type { CurrentUser } from "@/platform/auth/types";
import { hasPermission } from "@/platform/rbac";
import { ApprovalButtons } from "./ApprovalButtons";
import { EmptyState } from "./EmptyState";
import { Money } from "./Money";
import { RelativeTime } from "./RelativeTime";
import { StatusBadge } from "./StatusBadge";

/**
 * Approval status for a record: status, requester, decider, reason, and
 * approve/reject buttons. Requesters never see buttons on their own request.
 */
export function ApprovalPanel({ request, user }: { request: ApprovalRequest | null | undefined; user: CurrentUser }) {
  if (!request) {
    return <EmptyState icon={<ShieldCheck />} title="No approval requested" description="Actions over this tool's threshold need a second person's approval." />;
  }
  const permitted = hasPermission(user, request.approvePermission);
  const isRequester = request.requestedById === user.id;
  const canDecide = request.status === "pending" && permitted && !isRequester;
  const canExecute = request.status === "failed" && permitted;
  const rows: Array<[string, React.ReactNode]> = [
    ["Status", <StatusBadge key="s" status={request.status} />],
    ["Amount", request.amountCents != null ? <Money cents={request.amountCents} /> : null],
    ["Requested by", <span key="r">{request.requestedByName} · <RelativeTime date={request.createdAt} /></span>],
    ["Decided by", request.decidedByName ? <span key="d">{request.decidedByName}{request.decidedAt && <> · <RelativeTime date={request.decidedAt} /></>}</span> : null],
    ["Reason", request.reason],
    ["Last error", request.lastError],
  ];
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h3 className="text-sm font-semibold">Approval</h3>
        <span className="font-mono text-[11px] text-muted-foreground">{request.actionType}</span>
      </div>
      <dl className="space-y-2 px-4 py-3 text-sm">
        {rows
          .filter(([, v]) => v !== null && v !== undefined && v !== "")
          .map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
      </dl>
      {(canDecide || canExecute) && (
        <div className="border-t px-4 py-3">
          <ApprovalButtons requestId={request.id} canDecide={canDecide} canExecute={canExecute} />
        </div>
      )}
      {request.status === "pending" && isRequester && (
        <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">Waiting for someone else to approve. You can&apos;t approve your own request.</p>
      )}
    </div>
  );
}
