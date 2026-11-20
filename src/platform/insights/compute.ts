/**
 * Pure calculations for /insights. Everything here is derived from rows
 * passed in: nothing is hardcoded, so the numbers are only as good as the
 * audit trail and approval records behind them.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Linear-interpolated percentile (p in 0..100). Null for no values. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (Math.min(100, Math.max(0, p)) / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

export type DecisionRow = { tool: string; createdAt: Date; decidedAt: Date | null };
export type DecisionTime = { tool: string; decided: number; medianMs: number | null; p90Ms: number | null };

/** Median and p90 time from request to decision, per tool, slowest first. */
export function decisionTimesByTool(rows: readonly DecisionRow[]): DecisionTime[] {
  const byTool = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.decidedAt) continue;
    const ms = Math.max(0, r.decidedAt.getTime() - r.createdAt.getTime());
    byTool.set(r.tool, [...(byTool.get(r.tool) ?? []), ms]);
  }
  return [...byTool]
    .map(([tool, ms]) => ({ tool, decided: ms.length, medianMs: percentile(ms, 50), p90Ms: percentile(ms, 90) }))
    .sort((a, b) => (b.p90Ms ?? 0) - (a.p90Ms ?? 0));
}

export const AGE_BUCKETS = [
  { id: "lt4h", label: "Under 4h", maxMs: 4 * HOUR },
  { id: "4to24h", label: "4 to 24h", maxMs: DAY },
  { id: "1to3d", label: "1 to 3 days", maxMs: 3 * DAY },
  { id: "gt3d", label: "Over 3 days", maxMs: Number.POSITIVE_INFINITY },
] as const;

/** Pending approvals grouped by how long they've been waiting. */
export function pendingByAge(pending: ReadonlyArray<{ createdAt: Date }>, now: Date): Array<{ id: string; label: string; count: number }> {
  const counts = AGE_BUCKETS.map((b) => ({ id: b.id, label: b.label, count: 0 }));
  for (const p of pending) {
    const age = Math.max(0, now.getTime() - p.createdAt.getTime());
    const i = AGE_BUCKETS.findIndex((b) => age < b.maxMs);
    counts[i === -1 ? counts.length - 1 : i].count++;
  }
  return counts;
}

export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Every UTC day from `from` to `to`, inclusive. */
export function daysBetween(from: Date, to: Date): string[] {
  const days: string[] = [];
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  for (let t = start; t <= to.getTime(); t += DAY) days.push(dayKey(new Date(t)));
  return days;
}

export type DailySeries = { tools: string[]; points: Array<Record<string, number | string>> };

/** Audit events per tool per UTC day, with zero-filled days. */
export function actionsPerDay(events: ReadonlyArray<{ tool: string; createdAt: Date }>, from: Date, to: Date): DailySeries {
  const days = daysBetween(from, to);
  const counts = new Map<string, Map<string, number>>();
  for (const e of events) {
    const day = dayKey(e.createdAt);
    const perTool = counts.get(e.tool) ?? new Map<string, number>();
    perTool.set(day, (perTool.get(day) ?? 0) + 1);
    counts.set(e.tool, perTool);
  }
  const tools = [...counts.keys()].sort();
  const points = days.map((date) => {
    const point: Record<string, number | string> = { date };
    for (const tool of tools) point[tool] = counts.get(tool)?.get(date) ?? 0;
    return point;
  });
  return { tools, points };
}

/** Top people by count of rows, using the given name and ID fields. */
export function topPeople<T>(rows: readonly T[], id: (r: T) => string | null, name: (r: T) => string | null, take = 5) {
  const counts = new Map<string, { name: string; count: number }>();
  for (const r of rows) {
    const key = id(r);
    if (!key) continue;
    const entry = counts.get(key) ?? { name: name(r) ?? key, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, take);
}

/** Separation of duties: decided requests, and how many the requester decided themselves. */
export function separationOfDuties(rows: ReadonlyArray<{ requestedById: string; decidedById: string | null }>) {
  const decided = rows.filter((r) => r.decidedById);
  return { decided: decided.length, selfDecided: decided.filter((r) => r.decidedById === r.requestedById).length };
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60_000))}m`;
  if (ms < DAY) return `${(ms / HOUR).toFixed(1)}h`;
  return `${(ms / DAY).toFixed(1)}d`;
}

/** Parse a YYYY-MM-DD range (UTC). Defaults to the last 30 days; max 180. */
export function parseRange(fromRaw: string | undefined, toRaw: string | undefined, now: Date): { from: Date; to: Date } {
  const parse = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00.000Z`) : null);
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let to = parse(toRaw) ?? todayStart;
  let from = parse(fromRaw) ?? new Date(to.getTime() - 29 * DAY);
  if (Number.isNaN(to.getTime())) to = todayStart;
  if (Number.isNaN(from.getTime()) || from > to) from = new Date(to.getTime() - 29 * DAY);
  if (to.getTime() - from.getTime() > 179 * DAY) from = new Date(to.getTime() - 179 * DAY);
  return { from, to: new Date(to.getTime() + DAY - 1) };
}
