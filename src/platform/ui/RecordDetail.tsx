import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type RecordField = { label: string; value: ReactNode; wide?: boolean };

/** Read-only record view: header, field grid, optional actions and sections. */
export function RecordDetail({
  title,
  subtitle,
  status,
  fields,
  actions,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  fields: RecordField[];
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            {status}
          </div>
          {subtitle && <p className="mt-0.5 font-mono text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <div key={f.label} className={cn("min-w-0", f.wide && "sm:col-span-2 lg:col-span-3")}>
            <dt className="text-xs font-medium text-muted-foreground">{f.label}</dt>
            <dd className="mt-0.5 truncate text-sm">{f.value ?? <span className="text-muted-foreground">—</span>}</dd>
          </div>
        ))}
      </dl>
      {children && <div className="border-t px-5 py-4">{children}</div>}
    </section>
  );
}
