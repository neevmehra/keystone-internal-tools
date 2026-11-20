import { diffAudit, type FieldChange } from "@/platform/audit";

const MAX_INLINE = 3;

function show(value: unknown) {
  if (value === undefined || value === null || value === "") return <span className="text-muted-foreground">—</span>;
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  return <span title={s}>{s.length > 48 ? `${s.slice(0, 48)}…` : s}</span>;
}

function Rows({ changes }: { changes: FieldChange[] }) {
  return (
    <>
      {changes.map((c) => (
        <div key={c.field} className="grid grid-cols-[minmax(0,6rem)_minmax(0,1fr)] gap-x-2 text-[11px] leading-5">
          <span className="truncate font-mono text-muted-foreground">{c.field}</span>
          <span className="min-w-0 truncate font-mono">
            <span className="text-red-700 line-through decoration-red-300">{show(c.before)}</span>
            <span className="px-1 text-muted-foreground">→</span>
            <span className="text-emerald-700">{show(c.after)}</span>
          </span>
        </div>
      ))}
    </>
  );
}

/** Field-level before/after diff for one audit event (pass a masked event). */
export function AuditDiff({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const changes = diffAudit(before, after);
  if (changes.length === 0) return <span className="text-xs text-muted-foreground">No field changes</span>;
  const inline = changes.slice(0, MAX_INLINE);
  const rest = changes.slice(MAX_INLINE);
  return (
    <div className="min-w-56 max-w-md">
      <Rows changes={inline} />
      {rest.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">+{rest.length} more</summary>
          <Rows changes={rest} />
        </details>
      )}
    </div>
  );
}
