import { ArrowLeft, Bot, ExternalLink, GitPullRequest } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEntityHistory } from "@/platform/audit";
import { maskAuditEvent } from "@/platform/audit/masking";
import { requirePagePermission } from "@/platform/auth";
import { hasPermission } from "@/platform/rbac";
import { canViewRequest, getRequest } from "@/platform/requests";
import { linkPullRequestAction, setAcusUsedAction } from "@/platform/requests/actions";
import { ActionForm } from "@/platform/ui/ActionForm";
import { ApprovalPanel } from "@/platform/ui/ApprovalPanel";
import { AuditTimeline } from "@/platform/ui/AuditTimeline";
import { Money } from "@/platform/ui/Money";
import { RecordDetail } from "@/platform/ui/RecordDetail";
import { RelativeTime } from "@/platform/ui/RelativeTime";
import { StatusBadge } from "@/platform/ui/StatusBadge";
import { kindLabel, RequestStatusBadge, RequestTimeline } from "../../components";
import { CopyButton } from "../../copy-button";
import { RefreshStatusButton } from "./session-panel";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("requests:create");
  const { id } = await params;
  const req = await getRequest(id);
  if (!req || !canViewRequest(user, req)) notFound();

  const [requestHistory, approvalHistory] = await Promise.all([
    getEntityHistory("ToolRequest", req.id),
    req.approvalRequestId ? getEntityHistory("ApprovalRequest", req.approvalRequestId) : Promise.resolve([]),
  ]);
  const history = [...requestHistory, ...approvalHistory]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
    .map((e) => maskAuditEvent(e, user));

  const isAdmin = hasPermission(user, "requests:approve");
  const launched = req.mode !== null;
  const payloadText = req.simulatedPayload ? JSON.stringify(req.simulatedPayload, null, 2) : null;

  return (
    <div className="space-y-5">
      <Link href="/build/requests" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Requests
      </Link>

      <RequestTimeline status={req.display} mode={req.mode} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <RecordDetail
            title={req.title}
            subtitle={req.id}
            status={<RequestStatusBadge status={req.display} />}
            fields={[
              { label: "Type", value: kindLabel(req.kind) },
              { label: "Tool", value: req.toolSlug ? <span className="font-mono text-xs">{req.toolSlug}</span> : null },
              { label: "Requested by", value: <span>{req.requestedByName} · <RelativeTime date={req.createdAt} /></span> },
              { label: req.kind === "change_tool" ? "What should change" : "Problem", value: <span className="whitespace-pre-wrap">{req.problem}</span>, wide: true },
              { label: "What people need to do", value: <span className="whitespace-pre-wrap">{req.workflow}</span>, wide: true },
              {
                label: "Who will use it",
                value: req.audienceGroups.length ? (
                  <span className="flex flex-wrap gap-1">
                    {req.audienceGroups.map((g) => (
                      <span key={g} className="rounded-md border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px]">
                        {g}
                      </span>
                    ))}
                  </span>
                ) : null,
              },
              {
                label: "Sign-off",
                value:
                  req.signOff || req.signOffAboveCents != null ? (
                    <span>
                      {req.signOff ?? "Yes"}
                      {req.signOffAboveCents != null && (
                        <>
                          {" "}
                          (above <Money cents={req.signOffAboveCents} />)
                        </>
                      )}
                    </span>
                  ) : (
                    "None"
                  ),
              },
              {
                label: "Data and money",
                value: (
                  <span className="flex gap-1">
                    {req.involvesPii && <StatusBadge status="Customer PII" tone="info" />}
                    {req.movesMoney && <StatusBadge status="Moves money" tone="warning" />}
                    {!req.involvesPii && !req.movesMoney && "Neither"}
                  </span>
                ),
              },
              {
                label: "Time spent today",
                value:
                  req.hoursPerWeek != null || req.peopleCount != null
                    ? `${req.peopleCount ? `${req.peopleCount} people, ` : ""}${req.hoursPerWeek != null ? `${req.hoursPerWeek} h/week` : "hours not estimated"}`
                    : null,
              },
            ]}
          />

          <section className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <h3 className="text-sm font-semibold">What Devin receives</h3>
              <CopyButton text={req.prompt} />
            </div>
            <pre className="max-h-96 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">{req.prompt}</pre>
          </section>

          <section className="rounded-lg border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold">History</h3>
            <AuditTimeline events={history} />
          </section>
        </div>

        <div className="space-y-5">
          <ApprovalPanel request={req.approval} user={user} />

          <section className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <Bot className="size-4" /> Devin session
              </h3>
              {launched && <StatusBadge status={req.mode === "live" ? "live" : "simulation"} tone={req.mode === "live" ? "success" : "info"} />}
            </div>
            <dl className="space-y-2 px-4 py-3 text-sm">
              {!launched && <p className="text-muted-foreground">Starts when an admin approves the request.</p>}
              {req.devinSessionUrl && (
                <Row label="Session">
                  <a href={req.devinSessionUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    Open in Devin <ExternalLink className="size-3" />
                  </a>
                </Row>
              )}
              {req.devinStatus && <Row label="Devin status">{req.devinStatus}</Row>}
              {req.prUrl && (
                <Row label="Pull request">
                  <a href={req.prUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    <GitPullRequest className="size-3.5" /> {req.prState ?? "open"}
                  </a>
                </Row>
              )}
              {req.acusUsed != null && <Row label="ACUs used">{req.acusUsed}</Row>}
              {req.launchedAt && (
                <Row label="Launched">
                  <RelativeTime date={req.launchedAt} />
                </Row>
              )}
              {req.lastSyncedAt && (
                <Row label="Last refreshed">
                  <RelativeTime date={req.lastSyncedAt} />
                </Row>
              )}
            </dl>
            {req.mode === "live" && req.devinSessionId && (
              <div className="border-t px-4 py-3">
                <RefreshStatusButton requestId={req.id} />
              </div>
            )}
            {req.mode === "simulation" && payloadText && (
              <div className="space-y-2 border-t px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">API request (simulation, not sent)</p>
                  <CopyButton text={payloadText} />
                </div>
                <pre className="max-h-72 overflow-auto rounded-md bg-muted/50 p-2 font-mono text-[10.5px] leading-relaxed">{payloadText}</pre>
                <p className="text-xs text-muted-foreground">Set DEVIN_API_KEY and DEVIN_ORG_ID on the server to launch real sessions. Or paste the prompt into Devin and link the PR below.</p>
              </div>
            )}
          </section>

          {isAdmin && launched && (
            <section className="space-y-4 rounded-lg border bg-card p-4">
              <div>
                <h3 className="mb-3 text-sm font-semibold">Link pull request</h3>
                <ActionForm
                  action={linkPullRequestAction}
                  hidden={{ requestId: req.id }}
                  fields={[
                    { name: "prUrl", label: "Pull request URL", required: true, defaultValue: req.prUrl ?? undefined, placeholder: "https://github.com/…/pull/12" },
                    {
                      name: "prState",
                      label: "State",
                      type: "select",
                      required: true,
                      defaultValue: req.prState ?? "open",
                      options: [
                        { label: "Open", value: "open" },
                        { label: "Merged", value: "merged" },
                        { label: "Closed", value: "closed" },
                      ],
                    },
                  ]}
                  submitLabel="Save"
                  successMessage="Pull request linked"
                  variant="outline"
                />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold">ACUs used</h3>
                <ActionForm
                  action={setAcusUsedAction}
                  hidden={{ requestId: req.id }}
                  fields={[{ name: "acus", label: "ACUs", required: true, placeholder: "e.g. 7.5", defaultValue: req.acusUsed?.toString(), hint: "Only needed if the Devin API doesn't report usage." }]}
                  submitLabel="Save"
                  successMessage="ACUs recorded"
                  variant="outline"
                />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
