/**
 * Presentation helpers for audit history: readable event titles, readable
 * field values, and the split between business fields and technical ones.
 * Pure functions, so they're unit-tested and shared by the record timeline,
 * the audit log and the customer activity feed.
 */
import type { FieldChange } from "@/platform/audit";
import { formatCurrency } from "./format";
import { actionLabel, fieldLabel, humanize, isTechnicalField } from "./labels";

/** Phrasing for the actions people see most. Keyed by the last two segments. */
const EVENT_TITLES: Record<string, string> = {
  "approval.request": "Sent for approval",
  "approval.approve": "Approved",
  "approval.reject": "Rejected",
  "approval.execute": "Executed",
  "approval.fail": "Execution failed",
  "refund.request": "Refund requested",
  "refund.retry": "Refund retried",
  "refund.execute": "Refund paid out",
  "dispute.pick_up": "Picked up",
  "dispute.save_evidence": "Evidence note saved",
  "dispute.mark_won": "Marked won",
  "dispute.mark_lost": "Marked lost",
  "dispute.write_off": "Written off",
  "customer.view": "Customer viewed",
  "customer.set_risk_tier": "Risk tier changed",
  "auth.sign_in": "Signed in",
  "request.submit": "Build request submitted",
  "request.set_acus": "ACU usage recorded",
  "request.link_pr": "Pull request linked",
  "request.launch": "Devin session launched",
  "access_review.start": "Access review started",
  "access_review.decide": "Access decision recorded",
  "access_review.complete": "Access review completed",
  "audit.export": "Audit log exported",
  "evidence.export": "Evidence pack downloaded",
};

/** "chargebacks.dispute.pick_up" -> "Picked up", "approval.request" -> "Sent for approval". */
export function eventTitle(action: string): string {
  const parts = action.split(".");
  const key = parts.slice(-2).join(".");
  return EVENT_TITLES[key] ?? actionLabel(key);
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === "";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** True for fields whose values read best as status badges. */
export function isStatusField(field: string): boolean {
  return field === "status" || field === "outcome" || /Status$/.test(field) || field === "decision" || field === "riskTier";
}

/**
 * A field value as a person would read it. Returns null for empty values so
 * callers decide how to show "nothing" (usually not at all).
 */
export function formatAuditValue(field: string, value: unknown): string | null {
  if (isEmpty(value)) return null;
  if (/Cents$/.test(field) && typeof value === "number") return formatCurrency(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && ISO_DATE.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return `${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(d)} UTC`;
    }
  }
  if (Array.isArray(value)) return value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string" && isStatusField(field)) return humanize(value);
  return String(value);
}

/** The raw value, for technical detail views. */
export function rawAuditValue(value: unknown): string {
  if (value === undefined) return "(unset)";
  if (value === null) return "null";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export type ReadableChange = {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
  /** Status-like field, rendered as badges from the raw values below. */
  status: boolean;
  rawBefore: string | null;
  rawAfter: string | null;
};

/**
 * Splits a diff into what a person reads and what only engineers need.
 * `created` is true when nothing had a value before (a new record), so the
 * UI shows "created with" values instead of a before/after diff.
 */
export function readableChanges(changes: FieldChange[]): { readable: ReadableChange[]; technical: FieldChange[]; created: boolean } {
  const readable: ReadableChange[] = [];
  const technical: FieldChange[] = [];
  for (const c of changes) {
    if (isTechnicalField(c.field)) {
      technical.push(c);
      continue;
    }
    const before = formatAuditValue(c.field, c.before);
    const after = formatAuditValue(c.field, c.after);
    if (before === null && after === null) {
      technical.push(c);
      continue;
    }
    const raw = (v: unknown) => (isEmpty(v) ? null : String(v));
    readable.push({
      field: c.field,
      label: fieldLabel(c.field),
      before,
      after,
      status: isStatusField(c.field) && typeof (c.after ?? c.before) === "string",
      rawBefore: raw(c.before),
      rawAfter: raw(c.after),
    });
  }
  const created = changes.length > 0 && changes.every((c) => isEmpty(c.before));
  return { readable, technical, created };
}
