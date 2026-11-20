import { redirect } from "next/navigation";
import { hasPermission } from "@/platform/rbac";
import type { Permission } from "@/platform/rbac/permissions";
import { getCurrentUser } from "./current-user";
import type { CurrentUser } from "./types";

/** For pages: redirect to sign-in or "Access not provisioned" as needed. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (user.roles.length === 0) redirect("/access-not-provisioned");
  return user;
}

/** For pages: 404-style denial when the permission is missing. */
export async function requirePagePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasPermission(user, permission)) redirect(`/forbidden?permission=${encodeURIComponent(permission)}`);
  return user;
}
