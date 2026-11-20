export function RoleChips({ roles, empty = "Nobody" }: { roles: readonly string[]; empty?: string }) {
  if (roles.length === 0) return <span className="text-xs text-muted-foreground">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <span key={r} className="rounded-md border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px]">
          {r}
        </span>
      ))}
    </div>
  );
}
