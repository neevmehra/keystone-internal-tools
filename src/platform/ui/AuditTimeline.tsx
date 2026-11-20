import { ArrowRight, History } from "lucide-react";
import { diffAudit, type AuditEventView, type FieldChange } from "@/platform/audit";
import { cn } from "@/lib/utils";
import { eventTitle, rawAuditValue, readableChanges, type ReadableChange } from "./audit-format";
import { EmptyState } from "./EmptyState";
import { RelativeTime } from "./RelativeTime";
import { StatusBadge } from "./StatusBadge";

function Value({ change, side }: { change: ReadableChange; side: "before" | "after" }) {
  const v = change[side];
  if (v === null) return <span className="text-muted-foreground">none</span>;
  if (change.status) return <StatusBadge status={(side === "before" ? change.rawBefore : change.rawAfter) ?? v} />;
  return <span className={cn("break-words", side === "before" && "text-muted-foreground")}>{v}</span>;
}

/** One change as "Label  before → after", or "Label  value" for new records. */
export function ChangeRow({ change, created }: { change: ReadableChange; created: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-baseline gap-x-3 py-0.5 text-xs">
      <dt className="truncate text-muted-foreground" title={change.field}>
        {change.label}
      </dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-1.5">
        {!created && change.before !== null && (
          <>
            <Value change={change} side="before" />
            <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-label="changed to" />
          </>
        )}
        <Value change={change} side="after" />
      </dd>
    </div>
  );
}

/** Raw field names and values, for engineers and auditors. */
export function TechnicalDetails({ action, changes }: { action: string; changes: FieldChange[] }) {
  return (
    <details className="group mt-1">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-[11px] text-muted-foreground select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <span className="transition-transform group-open:rotate-90">›</span> Technical details
      </summary>
      <div className="mt-1 rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] leading-5">
        <p className="text-muted-foreground">action: {action}</p>
        {changes.map((c) => (
          <p key={c.field} className="break-all">
            <span className="text-muted-foreground">{c.field}:</span> {rawAuditValue(c.before)} <span className="text-muted-foreground">→</span>{" "}
            {rawAuditValue(c.after)}
          </p>
        ))}
      </div>
    </details>
  );
}

/**
 * One record's history, newest first: what happened, who did it, when, and
 * the fields that changed, in plain language. Internal fields and raw values
 * sit behind "Technical details". Pass masked events.
 */
export function AuditTimeline({ events }: { events: AuditEventView[] }) {
  if (events.length === 0) {
    return <EmptyState icon={<History />} title="No history yet" description="Changes to this record will appear here." />;
  }
  return (
    <ol className="relative space-y-5 border-l pl-5">
      {events.map((e) => {
        const all = diffAudit(e.before, e.after);
        const { readable, created } = readableChanges(all);
        return (
          <li key={e.id} className="relative">
            <span className="absolute top-1.5 -left-[25px] size-2 rounded-full bg-primary ring-4 ring-card" />
            <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
              <span className="font-medium">{eventTitle(e.action)}</span>
              <span className="text-muted-foreground">by {e.actorName}</span>
              <span className="text-muted-foreground" aria-hidden>
                ·
              </span>
              <RelativeTime date={e.createdAt} className="text-xs text-muted-foreground" />
            </div>
            {readable.length > 0 && (
              <div className="mt-1.5 max-w-xl">
                {created && <p className="mb-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Created with</p>}
                <dl>
                  {readable.map((c) => (
                    <ChangeRow key={c.field} change={c} created={created} />
                  ))}
                </dl>
              </div>
            )}
            {all.length > 0 && <TechnicalDetails action={e.action} changes={all} />}
          </li>
        );
      })}
    </ol>
  );
}
