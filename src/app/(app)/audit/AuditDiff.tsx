import { diffAudit } from "@/platform/audit";
import { readableChanges } from "@/platform/ui/audit-format";
import { ChangeRow, TechnicalDetails } from "@/platform/ui/AuditTimeline";

const MAX_INLINE = 3;

/**
 * Field-level change for one audit event (pass a masked event). Readable by
 * default; auditors get the raw field names and values under
 * "Technical details".
 */
export function AuditDiff({
  action,
  before,
  after,
}: {
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  const all = diffAudit(before, after);
  if (all.length === 0) return <span className="text-xs text-muted-foreground">No field changes</span>;
  const { readable, created } = readableChanges(all);
  const inline = readable.slice(0, MAX_INLINE);
  const rest = readable.slice(MAX_INLINE);
  return (
    <div className="min-w-56 max-w-md">
      {inline.length > 0 ? (
        <dl>
          {inline.map((c) => (
            <ChangeRow key={c.field} change={c} created={created} />
          ))}
        </dl>
      ) : (
        <span className="text-xs text-muted-foreground">Internal fields only</span>
      )}
      {rest.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">+{rest.length} more</summary>
          <dl>
            {rest.map((c) => (
              <ChangeRow key={c.field} change={c} created={created} />
            ))}
          </dl>
        </details>
      )}
      <TechnicalDetails action={action} changes={all} />
    </div>
  );
}
