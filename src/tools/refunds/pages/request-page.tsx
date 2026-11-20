import { ArrowRight, Search, SearchX } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requirePagePermission } from "@/platform/auth";
import { hasPermission } from "@/platform/rbac";
import { ActionForm, EmptyState, Money, PageHeader, RecordDetail, RelativeTime, StatusBadge, humanize, type SearchParams } from "@/platform/ui";
import { formatCurrency } from "@/platform/ui/format";
import { requestRefund } from "../actions";
import { REFUND_REASONS, manifest } from "../manifest";
import { getTransactionForRefund, lookupTransactions, type LookupTransaction } from "../queries";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

function TransactionList({ results }: { results: LookupTransaction[] }) {
  return (
    <div className="divide-y rounded-lg border bg-card">
      {results.map((t) => (
        <div
          key={t.id}
          className={
            t.refundId || t.refundable
              ? "relative flex flex-wrap items-center gap-4 px-4 py-3 text-sm transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-muted/40 has-[a:focus-visible]:bg-muted/40"
              : "flex flex-wrap items-center gap-4 px-4 py-3 text-sm opacity-70"
          }
        >
          <div className="min-w-40">
            <p className="font-mono text-xs">{t.id}</p>
            <p className="text-xs text-muted-foreground">
              <RelativeTime date={t.createdAt} />
            </p>
          </div>
          <div className="min-w-48 flex-1">
            <p>{t.merchant}</p>
            <p className="text-xs text-muted-foreground">
              {t.customerName} · {t.customerEmail}
            </p>
          </div>
          <Money cents={t.amountCents} currency={t.currency} />
          <StatusBadge status={t.status} />
          <div className="ml-auto">
            {t.refundId ? (
              <Link
                href={`/tools/refunds/${t.refundId}`}
                className="text-xs text-muted-foreground underline-offset-2 after:absolute after:inset-0 hover:underline focus-visible:outline-none"
              >
                Already refunded: {t.refundId}
              </Link>
            ) : t.refundable ? (
              <Link
                href={`/tools/refunds/new?transactionId=${t.id}`}
                className={`${buttonVariants({ size: "sm", variant: "outline" })} after:absolute after:inset-0`}
              >
                Refund
                <ArrowRight className="size-3.5" />
              </Link>
            ) : (
              <span className="text-xs text-muted-foreground">Not refundable</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export async function RequestPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePagePermission("refunds:request");
  const sp = await searchParams;
  const q = first(sp.q);
  const transactionId = first(sp.transactionId);
  const canSearchEmail = hasPermission(user, "pii:read");

  const selected = transactionId ? await getTransactionForRefund(user, transactionId) : null;
  const lookup = !selected && q ? await lookupTransactions(user, q) : null;

  return (
    <div className="max-w-4xl space-y-5">
      <p className="text-sm text-muted-foreground">
        <Link href="/tools/refunds" className="-mx-1 inline-flex min-h-8 items-center rounded px-1 hover:bg-muted hover:text-foreground">
          Refunds
        </Link>{" "}
        / New refund
      </p>
      <PageHeader
        title="Request a refund"
        description="Find the card transaction, then enter the amount and reason. $100.00 or less is refunded immediately; more goes to finance for approval."
      />

      <form method="get" action="/tools/refunds/new" className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder={canSearchEmail ? "Transaction ID (txn_000123) or customer email" : "Transaction ID (txn_000123)"}
            className="h-9 pl-8"
            aria-label="Find a transaction"
            autoFocus={!selected}
          />
        </div>
        <button type="submit" className={buttonVariants({ size: "lg" })}>
          Find
        </button>
      </form>

      {selected ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <RecordDetail
              title={selected.merchant}
              subtitle={selected.id}
              status={<StatusBadge status={selected.status} />}
              fields={[
                { label: "Amount", value: <Money cents={selected.amountCents} currency={selected.currency} /> },
                { label: "Customer", value: selected.customerName },
                { label: "Customer email", value: selected.customerEmail },
                { label: "Card", value: `•••• ${selected.cardLast4}` },
                { label: "Category", value: selected.category },
                { label: "Date", value: <RelativeTime date={selected.createdAt} /> },
              ]}
            />
          </div>
          <div className="lg:col-span-2">
            {selected.refundId ? (
              <section className="rounded-lg border bg-card p-5">
                <h3 className="text-sm font-semibold">This transaction has a refund</h3>
                <p className="mt-1 text-sm text-muted-foreground">Each transaction can be refunded once. Open the refund to see its status and approval.</p>
                <Link href={`/tools/refunds/${selected.refundId}`} className={`${buttonVariants({ size: "lg" })} mt-4`}>
                  View refund
                  <ArrowRight className="size-3.5" />
                </Link>
              </section>
            ) : !selected.refundable ? (
              <EmptyState title="Not refundable" description={`Only settled transactions can be refunded. This one is ${selected.status}.`} />
            ) : (
              <section className="rounded-lg border bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold">Refund details</h3>
                <ActionForm
                  action={requestRefund}
                  hidden={{ transactionId: selected.id }}
                  fields={[
                    {
                      name: "amountCents",
                      label: "Amount (USD)",
                      type: "money",
                      required: true,
                      defaultValue: (selected.amountCents / 100).toFixed(2),
                      hint: `Up to ${formatCurrency(selected.amountCents, selected.currency)}. Over $100.00 needs finance approval.`,
                    },
                    {
                      name: "reason",
                      label: "Reason",
                      type: "select",
                      required: true,
                      options: REFUND_REASONS.map((r) => ({ label: humanize(r), value: r })),
                    },
                    { name: "note", label: "Note for the approver", type: "textarea", placeholder: "What happened, and what the customer told you" },
                  ]}
                  submitLabel="Request refund"
                  successMessage="Refund requested"
                />
              </section>
            )}
          </div>
        </div>
      ) : transactionId ? (
        <EmptyState icon={<SearchX />} title="Transaction not found" description={`No transaction with ID ${transactionId}.`} />
      ) : lookup ? (
        lookup.results.length ? (
          <TransactionList results={lookup.results} />
        ) : (
          <EmptyState icon={<SearchX />} title="No matches" description={lookup.note} />
        )
      ) : (
        <EmptyState
          icon={<Search />}
          title="Find a transaction to refund"
          description={`Search by transaction ID${canSearchEmail ? " or the customer's email" : ""}. Only settled transactions can be refunded.`}
        />
      )}
      <p className="text-xs text-muted-foreground">Tool owner: {manifest.ownerTeam}</p>
    </div>
  );
}
