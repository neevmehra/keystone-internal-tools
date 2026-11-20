/**
 * Read models for the admin console. Everything here is derived from code
 * (permissions.ts, group-role-map.ts, the tool registry), so the console can
 * never drift from what is actually enforced.
 */
import { GROUP_ROLE_MAP } from "@/platform/auth/group-role-map";
import type { ToolManifest } from "@/platform/manifest";
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES, type Role } from "@/platform/rbac/permissions";

export type AccessMatrix = {
  roles: readonly Role[];
  permissions: readonly string[];
  /** grants[role] = set of permissions the role holds */
  grants: Record<Role, ReadonlySet<string>>;
};

export function accessMatrix(): AccessMatrix {
  const grants = Object.fromEntries(ROLES.map((r) => [r, new Set<string>(ROLE_PERMISSIONS[r])])) as Record<Role, ReadonlySet<string>>;
  return { roles: ROLES, permissions: PERMISSIONS, grants };
}

/** Rows of role x permission with "Y" where granted, for CSV export. */
export function accessMatrixRows(): { header: string[]; rows: string[][] } {
  const m = accessMatrix();
  return {
    header: ["role", ...m.permissions],
    rows: m.roles.map((role) => [role, ...m.permissions.map((p) => (m.grants[role].has(p) ? "Y" : ""))]),
  };
}

export function groupRoleRows(): Array<{ group: string; role: Role }> {
  return Object.entries(GROUP_ROLE_MAP)
    .map(([group, role]) => ({ group, role }))
    .sort((a, b) => a.group.localeCompare(b.group));
}

/** Groups that grant a role (the inverse of GROUP_ROLE_MAP). */
export function groupsForRole(role: Role): string[] {
  return groupRoleRows().filter((r) => r.role === role).map((r) => r.group);
}

export function rolesWith(permission: string): Role[] {
  return ROLES.filter((r) => (ROLE_PERMISSIONS[r] as readonly string[]).includes(permission));
}

/** Which roles can read, write and approve in a tool, from its permission strings. */
export function toolAccess(tool: Pick<ToolManifest, "slug" | "readPermission">) {
  return {
    read: rolesWith(tool.readPermission),
    write: rolesWith(`${tool.slug}:write`),
    approve: rolesWith(`${tool.slug}:approve`),
  };
}
