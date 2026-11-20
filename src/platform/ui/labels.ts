/**
 * Human-readable labels for internal identifiers: tool slugs, roles, IdP
 * groups, audit actions and record fields. Use these anywhere a person reads
 * the value; keep raw identifiers for technical/audit detail views only.
 */
import type { Role } from "@/platform/rbac/permissions";
import { tools } from "@/tools";

const PLATFORM_TOOLS: Record<string, string> = {
  platform: "Platform",
  build: "Build with Devin",
  requests: "Build with Devin",
  admin: "Admin",
  customers: "Customers",
  demo: "Demo",
};

/** "refunds" -> "Refunds" (from the tool registry), "build" -> "Build with Devin". */
export function toolLabel(slug: string): string {
  return tools.find((t) => t.slug === slug)?.name ?? PLATFORM_TOOLS[slug] ?? humanize(slug);
}

const ROLE_LABELS: Record<Role, string> = {
  support_agent: "Support agent",
  ops_analyst: "Ops analyst",
  finance_approver: "Finance approver",
  compliance_officer: "Compliance officer",
  auditor: "Auditor",
  admin: "Platform admin",
};

/** "finance_approver" -> "Finance approver". */
export function roleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? humanize(role);
}

const GROUP_LABELS: Record<string, string> = {
  support: "Support",
  ops: "Payments Ops",
  "finance-approvers": "Finance approvers",
  compliance: "Compliance",
  auditors: "Auditors",
  "platform-admins": "Platform admins",
  contractors: "Contractors",
};

/** "finance-approvers" -> "Finance approvers". */
export function groupLabel(group: string): string {
  return GROUP_LABELS[group] ?? humanize(group);
}

const ACTION_VERBS: Record<string, string> = {
  request: "requested",
  approve: "approved",
  reject: "rejected",
  execute: "executed",
  fail: "failed",
  create: "created",
  update: "updated",
  delete: "deleted",
  sign_in: "signed in",
  view: "viewed",
  export: "exported",
  pick_up: "picked up",
  mark_won: "marked won",
  mark_lost: "marked lost",
  write_off: "written off",
  save_note: "note saved",
  retry: "retried",
  launch: "launched",
  complete: "completed",
  decide: "decided",
  start: "started",
};

const ENTITY_NOUNS: Record<string, string> = {
  approval: "Approval",
  refund: "Refund",
  dispute: "Dispute",
  auth: "",
  customer: "Customer",
  request: "Request",
  tool_request: "Build request",
  access_review: "Access review",
  audit: "Audit log",
  evidence: "Evidence pack",
};

/**
 * Audit action names to sentences: "approval.request" -> "Approval requested",
 * "refund.request" -> "Refund requested", "auth.sign_in" -> "Signed in".
 * Unknown actions are humanized word by word.
 */
export function actionLabel(action: string): string {
  const [entity, ...rest] = action.split(".");
  const verbKey = rest.join("_");
  const verb = ACTION_VERBS[verbKey] ?? humanize(verbKey).toLowerCase();
  const noun = entity in ENTITY_NOUNS ? ENTITY_NOUNS[entity] : humanize(entity);
  if (!rest.length) return humanize(entity);
  const sentence = noun ? `${noun} ${verb}` : verb;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** Fields that only matter to engineers; hide them in non-technical history views. */
const TECHNICAL_FIELDS = new Set(["id", "attempts", "idempotencyKey", "lastError", "result", "payload", "approvePermission", "requestId"]);

export function isTechnicalField(field: string): boolean {
  return TECHNICAL_FIELDS.has(field) || /Id$/.test(field);
}

/** "amountCents" -> "Amount", "decidedAt" -> "Decided at", "customerEmail" -> "Customer email". */
export function fieldLabel(field: string): string {
  return humanize(field.replace(/Cents$/, ""));
}

/** "snake_case", "kebab-case" or "camelCase" -> "Sentence case". */
export function humanize(value: string): string {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : value;
}
