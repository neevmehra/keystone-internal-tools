import { formatDistanceToNowStrict } from "date-fns";

export function formatCurrency(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function formatAbsolute(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

export function formatRelative(date: Date, now = new Date()): string {
  if (Math.abs(now.getTime() - date.getTime()) < 45_000) return "just now";
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

export function humanize(value: string): string {
  return value.replace(/[_.-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
