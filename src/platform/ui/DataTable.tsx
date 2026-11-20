"use client";

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PAGE_SIZES } from "./table-params";

export type DataTableColumn = { id: string; header: string; sortable?: boolean; align?: "left" | "right"; className?: string };
/** Cells are rendered on the server (already masked), so rows stay serializable. */
export type DataTableRow = { id: string; href?: string; cells: Record<string, ReactNode> };
export type DataTableFilter =
  | { id: string; label: string; type: "text"; placeholder?: string }
  | { id: string; label: string; type: "select"; options: Array<{ label: string; value: string }> }
  | { id: string; label: string; type: "date" };

type Props = {
  columns: DataTableColumn[];
  rows: DataTableRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  dir: "asc" | "desc";
  filters?: DataTableFilter[];
  filterValues?: Record<string, string>;
  emptyState?: ReactNode;
};

/**
 * Server-driven table: paging, sorting and filters live in the URL, so views
 * are shareable links. The server fetches only the current page.
 */
export function DataTable({ columns, rows, total, page, pageSize, sort, dir, filters = [], filterValues = {}, emptyState }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const setParams = (updates: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete("page");
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const columnDefs = useMemo<ColumnDef<DataTableRow>[]>(
    () =>
      columns.map((c) => ({
        id: c.id,
        header: c.header,
        enableSorting: !!c.sortable,
        cell: ({ row }) => row.original.cells[c.id],
      })),
    [columns],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (r) => r.id,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    pageCount,
    state: { sorting: [{ id: sort, desc: dir === "desc" }], pagination: { pageIndex: page - 1, pageSize } },
  });

  const toggleSort = (id: string) => {
    const nextDir = sort === id && dir === "desc" ? "asc" : "desc";
    setParams({ sort: id, dir: nextDir });
  };

  const activeFilters = filters.filter((f) => filterValues[f.id]);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const align = (id: string) => columns.find((c) => c.id === id)?.align;

  return (
    <div className="space-y-3">
      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((f) => (
            <FilterControl key={f.id} filter={f} value={filterValues[f.id] ?? ""} onChange={(v) => setParams({ [f.id]: v })} />
          ))}
          {activeFilters.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setParams(Object.fromEntries(filters.map((f) => [f.id, null])))}>
              <X /> Clear
            </Button>
          )}
        </div>
      )}
      <div className={cn("relative overflow-hidden rounded-lg border bg-card transition-opacity", pending && "opacity-60")}>
        {pending && <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-primary" />}
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/40 hover:bg-muted/40">
                {hg.headers.map((h) => {
                  const sortable = !!columns.find((c) => c.id === h.column.id)?.sortable;
                  const active = sort === h.column.id;
                  const Icon = !active ? ArrowUpDown : dir === "desc" ? ArrowDown : ArrowUp;
                  return (
                    <TableHead key={h.id} className={cn("h-9 text-xs", align(h.column.id) === "right" && "text-right")}>
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(h.column.id)}
                          className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          <Icon className={cn("size-3", !active && "opacity-40")} />
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-4">
                  {emptyState ?? <p className="py-6 text-center text-sm text-muted-foreground">No results.</p>}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(row.original.href && "cursor-pointer")}
                  onClick={row.original.href ? () => router.push(row.original.href!) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cn("py-2 text-sm", align(cell.column.id) === "right" && "text-right")}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5">
            Rows
            <select
              className="h-7 rounded-md border bg-background px-1.5 text-xs"
              value={pageSize}
              onChange={(e) => setParams({ pageSize: e.target.value })}
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <span className="tabular-nums">
            Page {page} of {pageCount.toLocaleString()}
          </span>
          <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) }, false)}>
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={page >= pageCount}
            onClick={() => setParams({ page: String(page + 1) }, false)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

function FilterControl({ filter, value, onChange }: { filter: DataTableFilter; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setText(value);
  }
  useEffect(() => {
    if (filter.type !== "text" || text === value) return;
    const t = setTimeout(() => onChange(text), 300);
    return () => clearTimeout(t);
  }, [text, value, filter.type, onChange]);

  if (filter.type === "select") {
    return (
      <select
        aria-label={filter.label}
        className={cn("h-8 rounded-lg border bg-background px-2 text-sm", !value && "text-muted-foreground")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{filter.label}: All</option>
        {filter.options.map((o) => (
          <option key={o.value} value={o.value}>
            {filter.label}: {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (filter.type === "date") {
    return (
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {filter.label}
        <Input type="date" className="h-8 w-36" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label={filter.label}
        placeholder={filter.placeholder ?? filter.label}
        className="h-8 w-48 pl-7"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}
