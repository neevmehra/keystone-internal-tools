/**
 * Role -> permission mapping. Access changes happen by PR: this file's Git
 * history is the change-management record for auditors.
 */
export const ROLES = [
  "support_agent",
  "ops_analyst",
  "finance_approver",
  "compliance_officer",
  "auditor",
  "admin",
] as const;
export type Role = (typeof ROLES)[number];

export const PLATFORM_PERMISSIONS = [
  "pii:read",
  "audit:read",
  "audit:export",
  "approvals:view",
  "admin:read",
  "requests:create",
  "requests:approve",
  // Demo seed data only (prisma/seed.ts, tool "demo"). Remove with that seed
  // section once real tools seed their own approvals.
  "demo:approve",
  "access_reviews:manage",
] as const;

// Tool permissions: `<tool>:read`, `<tool>:write`, `<tool>:approve`.
// `npm run new-tool` adds `<slug>:read` and `<slug>:write` here with no roles.
export const TOOL_PERMISSIONS = [
  "refunds:read",
  "refunds:request",
  "refunds:approve",
  // keystone:tool-permissions
] as const;

export const PERMISSIONS = [...PLATFORM_PERMISSIONS, ...TOOL_PERMISSIONS] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // Support talks to customers, so it sees their email (pii:read). Finance
  // approvers decide on amounts and reasons and don't need it.
  support_agent: ["requests:create", "pii:read", "refunds:read", "refunds:request"],
  ops_analyst: ["requests:create"],
  finance_approver: ["approvals:view", "demo:approve", "requests:create", "refunds:read", "refunds:approve"],
  compliance_officer: ["pii:read", "audit:read", "approvals:view", "admin:read", "access_reviews:manage", "refunds:read"],
  auditor: ["audit:read", "audit:export", "admin:read", "refunds:read"],
  // Least privilege: admins manage access, they don't need customer PII.
  admin: ["admin:read", "audit:read", "audit:export", "access_reviews:manage", "approvals:view", "requests:create", "requests:approve", "refunds:read"],
};

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function permissionsForRoles(roles: readonly Role[]): Permission[] {
  const set = new Set<Permission>();
  for (const role of roles) for (const p of ROLE_PERMISSIONS[role] ?? []) set.add(p);
  return [...set].sort();
}
