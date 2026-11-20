import { History } from "lucide-react";
import { diffAudit, type AuditEventView } from "@/platform/audit";
import { EmptyState } from "./EmptyState";
import { RelativeTime } from "./RelativeTime";

function show(value: unknown) {
  if (value === undefined || value === null || value === "") return <span className="text-muted-foreground">—</span>;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/** One record's history: who, what, when, and a field-level before/after diff. Pass masked events. */
export function AuditTimeline({ events }: { events: AuditEventView[] }) {
  if (events.length === 0) {
    return <EmptyState icon={<History />} title="No history yet" description="Changes to this record will appear here." />;
  }
  return (
    <ol className="relative space-y-4 border-l pl-5">
      {events.map((e) => {
        const changes = diffAudit(e.before, e.after);
        return (
          <li key={e.id} className="relative">
            <span className="absolute top-1.5 -left-[25px] size-2 rounded-full bg-primary ring-4 ring-background" />
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium">{e.actorName}</span>
              <span className="font-mono text-xs text-muted-foreground">{e.action}</span>
              <RelativeTime date={e.createdAt} className="text-xs text-muted-foreground" />
            </div>
            {changes.length > 0 && (
              <table className="mt-1.5 w-full max-w-xl text-xs">
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.field} className="align-top">
                      <td className="w-32 py-0.5 pr-2 font-mono text-muted-foreground">{c.field}</td>
                      <td className="py-0.5 pr-2 text-red-700 line-through decoration-red-300">{show(c.before)}</td>
                      <td className="py-0.5 text-emerald-700">{show(c.after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </li>
        );
      })}
    </ol>
  );
}
