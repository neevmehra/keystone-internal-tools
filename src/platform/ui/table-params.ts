export type SearchParams = Record<string, string | string[] | undefined>;

export const PAGE_SIZES = [25, 50, 100] as const;

export type TableParams<S extends string> = {
  page: number;
  pageSize: number;
  sort: S;
  dir: "asc" | "desc";
  skip: number;
  take: number;
  filters: Record<string, string>;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Parse DataTable state from URL search params (server side). Unknown sort
 * columns and filters are ignored, so URLs can't query arbitrary fields.
 */
export function parseTableParams<S extends string>(
  sp: SearchParams,
  opts: { sortable: readonly S[]; defaultSort: S; defaultDir?: "asc" | "desc"; filters?: readonly string[]; defaultPageSize?: number },
): TableParams<S> {
  const pageSizeRaw = Number(first(sp.pageSize));
  const pageSize = (PAGE_SIZES as readonly number[]).includes(pageSizeRaw) ? pageSizeRaw : (opts.defaultPageSize ?? PAGE_SIZES[0]);
  const page = Math.max(1, Math.floor(Number(first(sp.page)) || 1));
  const sortRaw = first(sp.sort);
  const sort = (opts.sortable as readonly string[]).includes(sortRaw ?? "") ? (sortRaw as S) : opts.defaultSort;
  const dirRaw = first(sp.dir);
  const dir = dirRaw === "asc" || dirRaw === "desc" ? dirRaw : (opts.defaultDir ?? "desc");
  const filters: Record<string, string> = {};
  for (const key of opts.filters ?? []) {
    const value = first(sp[key])?.trim();
    if (value) filters[key] = value.slice(0, 200);
  }
  return { page, pageSize, sort, dir, skip: (page - 1) * pageSize, take: pageSize, filters };
}
