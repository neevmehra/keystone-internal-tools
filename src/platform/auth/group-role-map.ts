import type { Role } from "@/platform/rbac/permissions";

/** IdP group -> app role. Unknown groups grant nothing. */
export const GROUP_ROLE_MAP: Readonly<Record<string, Role>> = {
  support: "support_agent",
  ops: "ops_analyst",
  "finance-approvers": "finance_approver",
  compliance: "compliance_officer",
  auditors: "auditor",
  "platform-admins": "admin",
};

export function rolesForGroups(groups: readonly string[]): Role[] {
  const roles = new Set<Role>();
  for (const group of groups) {
    if (Object.prototype.hasOwnProperty.call(GROUP_ROLE_MAP, group)) roles.add(GROUP_ROLE_MAP[group]);
  }
  return [...roles].sort();
}
