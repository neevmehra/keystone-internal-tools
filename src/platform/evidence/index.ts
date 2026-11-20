/**
 * Evidence pack: the files an auditor or sponsor bank asks for every cycle,
 * generated from live data in one download instead of a week of spreadsheets.
 * Generating a pack is itself an audit event.
 */
import { randomUUID } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { revocationList, latestCompletedReview } from "@/platform/access-reviews";
import { accessMatrixRows, groupRoleRows } from "@/platform/admin";
import { iterateAuditEvents, recordAudit } from "@/platform/audit";
import { maskAuditEvent } from "@/platform/audit/masking";
import type { CurrentUser } from "@/platform/auth/types";
import { toCsv } from "@/platform/csv";
import { db } from "@/platform/db";
import { fromJson } from "@/platform/json";
import { maskRecord } from "@/platform/rbac/mask";

/** Employee contact details are masked for users without pii:read, like everywhere else. */
const USER_PII = ["email"];

export const EVIDENCE_FILES = [
  "README.txt",
  "access-matrix.csv",
  "group-role-map.csv",
  "users.csv",
  "approvals.csv",
  "audit-events.csv",
  "access-review.csv",
] as const;

export type EvidenceRange = { from: Date; to: Date };

const day = (d: Date) => d.toISOString().slice(0, 10);

async function usersCsv(viewer: CurrentUser) {
  const users = await db.user.findMany({ orderBy: { name: "asc" } });
  return toCsv(
    ["user_id", "name", "email", "idp_groups", "app_roles", "last_sign_in", "created_at"],
    users.map((u) => {
      const m = maskRecord({ email: u.email }, USER_PII, viewer);
      return [u.id, u.name, m.email, fromJson<string[]>(u.groups, []).join(" "), fromJson<string[]>(u.roles, []).join(" "), u.lastLoginAt, u.createdAt];
    }),
  );
}

export async function approvalsCsv(range: EvidenceRange) {
  const rows = await db.approvalRequest.findMany({
    where: { createdAt: { gte: range.from, lte: range.to } },
    orderBy: { createdAt: "asc" },
  });
  return {
    count: rows.length,
    csv: toCsv(
      [
        "approval_id",
        "tool",
        "action_type",
        "entity_type",
        "entity_id",
        "amount_cents",
        "status",
        "requested_by_id",
        "requested_by",
        "requested_at",
        "decided_by_id",
        "decided_by",
        "decided_at",
        "executed_at",
        "requester_is_not_decider",
      ],
      rows.map((r) => [
        r.id,
        r.tool,
        r.actionType,
        r.entityType,
        r.entityId,
        r.amountCents,
        r.status,
        r.requestedById,
        r.requestedByName,
        r.createdAt,
        r.decidedById,
        r.decidedByName,
        r.decidedAt,
        r.executedAt,
        // Separation of duties, computed per row from the data.
        r.decidedById ? String(r.decidedById !== r.requestedById) : "not_decided",
      ]),
    ),
  };
}

async function auditCsv(range: EvidenceRange, viewer: CurrentUser) {
  const header = ["id", "created_at", "actor_id", "actor_name", "actor_roles", "tool", "action", "entity_type", "entity_id", "before", "after", "request_id"];
  const rows: unknown[][] = [];
  for await (const e of iterateAuditEvents({ from: range.from, to: range.to })) {
    const m = maskAuditEvent(e, viewer);
    rows.push([m.id, m.createdAt, m.actorId, m.actorName, m.actorRoles.join(" "), m.tool, m.action, m.entityType, m.entityId, m.before, m.after, m.requestId]);
  }
  return { count: rows.length, csv: toCsv(header, rows) };
}

async function accessReviewCsv(viewer: CurrentUser) {
  const review = await latestCompletedReview();
  if (!review) return { review: null, csv: "No completed access review yet.\n" };
  const csv = toCsv(
    ["review", "user_id", "name", "email", "idp_groups", "app_roles", "last_sign_in", "stale_30d", "decision", "note", "decided_by", "decided_at"],
    review.items.map((i) => [
      review.name,
      i.userId,
      i.userName,
      maskRecord({ email: i.userEmail }, USER_PII, viewer).email,
      i.groups.join(" "),
      i.roles.join(" "),
      i.lastLoginAt,
      i.stale,
      i.decision,
      i.note,
      i.decidedByName,
      i.decidedAt,
    ]),
  );
  return { review, csv };
}

function readme(opts: {
  range: EvidenceRange;
  generatedBy: string;
  generatedAt: Date;
  approvals: number;
  auditEvents: number;
  review: { name: string; completedAt: Date | null; completedByName: string | null; revoke: number; total: number } | null;
}) {
  const r = opts.review;
  return `KEYSTONE EVIDENCE PACK
Period: ${day(opts.range.from)} to ${day(opts.range.to)}
Generated: ${opts.generatedAt.toISOString()} by ${opts.generatedBy}
Generating this pack was itself recorded in the audit log (action: evidence.export).

FILES AND THE CONTROLS THEY SUPPORT

access-matrix.csv  (Access control)
  Every app role and the permissions it holds (Y = granted). Generated from
  src/platform/rbac/permissions.ts, the same code that enforces access.

group-role-map.csv  (Access control)
  Which identity-provider group grants which app role. People get access only
  through IdP group membership; unknown groups grant nothing.

users.csv  (Access control)
  Everyone who has signed in, with their current IdP groups, app roles and
  last sign-in. Roles are recomputed from groups at every sign-in, so removing
  someone from a group in the IdP removes their access.

access-review.csv  (Periodic access review)
  ${r ? `The latest completed review: "${r.name}", completed ${r.completedAt?.toISOString() ?? ""} by ${r.completedByName ?? ""}.
  ${r.total} users reviewed, ${r.revoke} marked for revocation. Users not signed in for 30+
  days are flagged stale. Reviewers cannot decide their own access.` : "No completed access review exists yet."}

approvals.csv  (Separation of duties)
  ${opts.approvals} approval requests created in the period, with requester and decider.
  requester_is_not_decider is computed per row from the data. The platform
  rejects self-approval in code, and that rule is covered by automated tests.

audit-events.csv  (Monitoring)
  ${opts.auditEvents} audit events in the period. The log is append-only: the application
  has no update or delete path, and each event is written in the same database
  transaction as the change it describes. Customer PII is masked for viewers
  without the pii:read permission.

CHANGE MANAGEMENT
  Code changes and access changes (permissions.ts, group-role-map.ts) are
  evidenced by Git pull request history: every change is reviewed and approved
  before merge, and CI runs tests and a governance check on every pull request.
`;
}

/** Build the pack (as the given viewer, with their masking) and record the export. */
export async function buildEvidencePack(viewer: CurrentUser, range: EvidenceRange) {
  const generatedAt = new Date();
  const matrix = accessMatrixRows();
  const [users, approvals, audit, review] = await Promise.all([
    usersCsv(viewer),
    approvalsCsv(range),
    auditCsv(range, viewer),
    accessReviewCsv(viewer),
  ]);
  const reviewInfo = review.review && {
    name: review.review.name,
    completedAt: review.review.completedAt,
    completedByName: review.review.completedByName,
    revoke: revocationList(review.review.items).length,
    total: review.review.items.length,
  };

  const files: Record<(typeof EVIDENCE_FILES)[number], string> = {
    "README.txt": readme({ range, generatedBy: viewer.name, generatedAt, approvals: approvals.count, auditEvents: audit.count, review: reviewInfo }),
    "access-matrix.csv": toCsv(matrix.header, matrix.rows),
    "group-role-map.csv": toCsv(["idp_group", "app_role"], groupRoleRows().map((r) => [r.group, r.role])),
    "users.csv": users,
    "approvals.csv": approvals.csv,
    "audit-events.csv": audit.csv,
    "access-review.csv": review.csv,
  };

  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])), { level: 6 });
  const fileName = `keystone-evidence-${day(range.from)}-to-${day(range.to)}.zip`;

  await db.$transaction((tx) =>
    recordAudit(tx, {
      actor: { id: viewer.id, name: viewer.name, roles: viewer.roles },
      tool: "platform",
      action: "evidence.export",
      entityType: "EvidencePack",
      entityId: `evp_${randomUUID()}`,
      before: null,
      after: { from: day(range.from), to: day(range.to), files: Object.keys(files), approvals: approvals.count, auditEvents: audit.count },
    }),
  );

  return { zip, fileName, files };
}

/** Parse YYYY-MM-DD bounds; defaults to the last 90 days. */
export function parseEvidenceRange(from: string | null, to: string | null, now = new Date()): EvidenceRange {
  const valid = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const end = valid(to) ? new Date(`${to}T23:59:59.999Z`) : now;
  const start = valid(from) ? new Date(`${from}T00:00:00.000Z`) : new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}
