/**
 * Impact math for /build/impact. Pure, so the numbers on the page are the
 * same numbers the tests check, and each one carries the formula shown on
 * hover.
 */
import { permissionsForRoles, type Role } from "@/platform/rbac/permissions";
import { displayStatus, type DisplayStatus } from "./status";

export type ImpactRequest = {
  status: string;
  prState: string | null;
  toolSlug: string | null;
  audienceGroups: readonly string[];
  hoursPerWeek: number | null;
  acusUsed: number | null;
  approvalStatus: string | null;
};

export type ImpactUser = { id: string; groups: readonly string[]; roles: readonly Role[] };

export type Impact = {
  byStatus: Record<DisplayStatus, number>;
  total: number;
  shipped: number;
  hoursSavedPerWeek: number;
  totalAcus: number;
  acuPrice: number | null;
  acuCost: number | null;
  shippedTools: string[];
  seatUsers: number;
  seatPrice: number;
  seatCostMonthly: number;
  seatCostAnnual: number;
  formulas: Record<"hours" | "acus" | "acuCost" | "seats" | "seatCost", string>;
};

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

export function parsePrice(raw: string | undefined, fallback: number | null): number | null {
  const n = Number(raw);
  return raw?.trim() && Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * @param readPermissionFor maps a shipped tool slug to its read permission
 *   (from the registry; `<slug>:read` when the tool isn't installed).
 */
export function computeImpact(opts: {
  requests: readonly ImpactRequest[];
  users: readonly ImpactUser[];
  readPermissionFor: (slug: string) => string;
  acuPrice: number | null;
  seatPrice: number;
}): Impact {
  const byStatus = Object.fromEntries(
    ["submitted", "rejected", "approved", "launch_failed", "ready_simulation", "building", "pr_open", "pr_closed", "merged"].map((s) => [s, 0]),
  ) as Record<DisplayStatus, number>;
  for (const r of opts.requests) byStatus[displayStatus(r, r.approvalStatus ? { status: r.approvalStatus } : null)]++;

  const shipped = opts.requests.filter((r) => displayStatus(r, r.approvalStatus ? { status: r.approvalStatus } : null) === "merged");
  const hoursSavedPerWeek = round(shipped.reduce((sum, r) => sum + (r.hoursPerWeek ?? 0), 0), 1);
  const totalAcus = round(opts.requests.reduce((sum, r) => sum + (r.acusUsed ?? 0), 0));
  const acuCost = opts.acuPrice == null ? null : round(totalAcus * opts.acuPrice);

  const shippedTools = [...new Set(shipped.map((r) => r.toolSlug).filter((s): s is string => !!s))].sort();
  const readPerms = new Set(shippedTools.map(opts.readPermissionFor));
  const audience = new Set(shipped.flatMap((r) => r.audienceGroups));
  const seatUsers = opts.users.filter(
    (u) => permissionsForRoles(u.roles).some((p) => readPerms.has(p)) || u.groups.some((g) => audience.has(g)),
  ).length;
  const seatCostMonthly = round(seatUsers * opts.seatPrice);

  return {
    byStatus,
    total: opts.requests.length,
    shipped: shipped.length,
    hoursSavedPerWeek,
    totalAcus,
    acuPrice: opts.acuPrice,
    acuCost,
    shippedTools,
    seatUsers,
    seatPrice: opts.seatPrice,
    seatCostMonthly,
    seatCostAnnual: round(seatCostMonthly * 12),
    formulas: {
      hours: `Sum of "hours a week today" across ${shipped.length} merged request${shipped.length === 1 ? "" : "s"}, as estimated by the requesters.`,
      acus: `Sum of ACUs recorded on all ${opts.requests.length} requests (from the Devin API, or entered by an admin).`,
      acuCost:
        opts.acuPrice == null
          ? "Set DEVIN_ACU_PRICE (your price per ACU in USD) to see cost."
          : `${totalAcus} ACUs × $${opts.acuPrice} per ACU (DEVIN_ACU_PRICE).`,
      seats: `Distinct Keystone users who can read a shipped tool (${shippedTools.join(", ") || "none yet"}) or are in a group the request was for.`,
      seatCost: `${seatUsers} users × $${opts.seatPrice} per user per month (POWERAPPS_SEAT_PRICE, Power Apps Premium list price).`,
    },
  };
}
