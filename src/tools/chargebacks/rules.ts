/**
 * Chargebacks business rules. Pure functions, no database access, so they're
 * shared by actions, queries, pages, seed data and tests.
 */
export const DISPUTE_STATUSES = ["open", "in_progress", "won", "lost", "written_off"] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

/** Statuses the team still has to act on. */
export const ACTIVE_STATUSES: readonly DisputeStatus[] = ["open", "in_progress"];
/** Outcomes that cost us money. */
export const LOSS_STATUSES: readonly DisputeStatus[] = ["lost", "written_off"];
export const RESOLVED_STATUSES: readonly DisputeStatus[] = ["won", "lost", "written_off"];

export const REASON_CODES = ["fraud", "not_received", "not_as_described", "duplicate", "canceled_subscription", "other"] as const;
export const REASON_LABELS: Record<(typeof REASON_CODES)[number], string> = {
  fraud: "Fraud",
  not_received: "Product not received",
  not_as_described: "Not as described",
  duplicate: "Duplicate charge",
  canceled_subscription: "Canceled subscription",
  other: "Other",
};

export const STATUS_LABELS: Record<DisputeStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  won: "Won",
  lost: "Lost, write-off pending",
  written_off: "Written off",
};

export const WRITE_OFF_ACTION = "chargebacks.write_off";
export const DAY_MS = 24 * 60 * 60 * 1000;
/** Disputes due within this window are flagged in the queue. */
export const DUE_SOON_DAYS = 2;

export function isActive(status: string) {
  return (ACTIVE_STATUSES as readonly string[]).includes(status);
}

export type Urgency = "overdue" | "due_soon" | "ok" | "none";

/** How urgent a dispute's response deadline is. Resolved disputes have none. */
export function urgency(d: { status: string; respondBy: Date }, now = new Date()): Urgency {
  if (!isActive(d.status)) return "none";
  const ms = d.respondBy.getTime() - now.getTime();
  if (ms < 0) return "overdue";
  if (ms <= DUE_SOON_DAYS * DAY_MS) return "due_soon";
  return "ok";
}

/** Whole days until the deadline, rounded up (0 = due today, negative = overdue). */
export function daysLeft(respondBy: Date, now = new Date()) {
  return Math.ceil((respondBy.getTime() - now.getTime()) / DAY_MS);
}

export function startOfMonthUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Win rate over resolved disputes, or null when nothing is resolved yet. */
export function winRate(counts: { won: number; lost: number }) {
  const total = counts.won + counts.lost;
  return total === 0 ? null : counts.won / total;
}
