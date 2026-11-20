import type { ReactNode } from "react";

export type StatCard = { label: string; value: ReactNode; hint?: ReactNode };

export function StatCards({ items }: { items: StatCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="bg-card px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{item.value}</p>
          {item.hint && <p className="mt-0.5 text-xs text-muted-foreground">{item.hint}</p>}
        </div>
      ))}
    </div>
  );
}
