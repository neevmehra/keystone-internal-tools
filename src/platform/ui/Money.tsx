import { formatCurrency } from "./format";

export function Money({ cents, currency = "USD" }: { cents: number; currency?: string }) {
  return <span className="tabular-nums">{formatCurrency(cents, currency)}</span>;
}
