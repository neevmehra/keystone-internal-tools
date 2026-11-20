import { Search } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/platform/auth";
import { canViewCustomers, searchCustomers } from "@/platform/customers";
import { EmptyState } from "@/platform/ui/EmptyState";
import { PageHeader } from "@/platform/ui/PageHeader";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Full search results (also where the Cmd+K palette sends Enter).
 * `?open=customer` jumps straight to the customer behind the top match.
 */
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const user = await requireUser();
  if (!canViewCustomers(user)) redirect("/forbidden");
  const sp = await searchParams;
  const q = (first(sp.q) ?? "").trim();
  const { results, piiSearchBlocked } = q ? await searchCustomers(user, q) : { results: [], piiSearchBlocked: false };

  if (first(sp.open) === "customer") {
    const target = results.find((r) => r.customerId);
    if (target?.customerId) redirect(`/customers/${target.customerId}`);
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Search" description="Find a customer by customer, transaction, refund or dispute ID. Email and name search needs PII access." />
      <form action="/search" className="flex max-w-xl gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="cus_00042, txn_000021, ref_…, dsp_…, or an email"
          className="h-9 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <button type="submit" className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Search
        </button>
      </form>

      {piiSearchBlocked && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Searching by email or name needs PII access, which your role doesn&apos;t include. Search by an ID instead.
        </p>
      )}

      {q && results.length === 0 && !piiSearchBlocked && (
        <EmptyState icon={<Search />} title="No matches" description="IDs match from the start, e.g. “txn_00002”. Queries need at least 3 characters." />
      )}

      {results.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card">
          {results.map((r) => (
            <li key={r.id}>
              <Link href={r.href} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40">
                <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">{r.type}</span>
                <span className="font-medium">{r.title}</span>
                {r.subtitle && <span className="truncate text-muted-foreground">{r.subtitle}</span>}
                {r.customerId && r.type !== "Customer" && (
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{r.customerId}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
