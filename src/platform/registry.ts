import { hasPermission, type PermissionHolder } from "@/platform/rbac";
import { tools } from "@/tools";

export function getTool(slug: string) {
  return tools.find((t) => t.slug === slug);
}

/** Tools this user can open (has the manifest's readPermission). */
export function toolsForUser(user: PermissionHolder) {
  return tools.filter((t) => hasPermission(user, t.readPermission));
}
