import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatCard = { label: string; value: ReactNode; hint?: ReactNode };

/** Column layout per card count, so the row is always full (no empty cells). */
const GRID: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
};

export function StatCards({ items }: { items: StatCard[] }) {
  if (items.length === 0) return null;
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-lg border bg-border",
        GRID[items.length] ?? "grid-cols-2 lg:grid-cols-4",
        // Odd counts on two columns: let the last card span the row instead of leaving a hole.
        (items.length === 5 || items.length > 6) && "[&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1",
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0 bg-card px-4 py-3">
          <p className="truncate text-xs font-medium text-muted-foreground">{item.label}</p>
          <p className="mt-1 truncate text-xl font-semibold tabular-nums tracking-tight">{item.value}</p>
          {item.hint && <p className="mt-0.5 text-xs text-muted-foreground">{item.hint}</p>}
        </div>
      ))}
    </div>
  );
}
