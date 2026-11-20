import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/platform/db";
import { fromJson } from "@/platform/json";
import { permissionsForRoles, type Role } from "@/platform/rbac/permissions";
import { getAuthMode } from "./config";
import { MOCK_SESSION_COOKIE, verifySessionToken } from "./mock-session";
import type { CurrentUser } from "./types";

async function sessionUserId(): Promise<string | null> {
  if (getAuthMode() === "mock") {
    const jar = await cookies();
    return verifySessionToken(jar.get(MOCK_SESSION_COOKIE)?.value);
  }
  const { auth } = await import("./oidc");
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function loadUser(userId: string): Promise<CurrentUser | null> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const roles = fromJson<Role[]>(user.roles, []);
  return {
    id: user.id,
    subject: user.subject,
    name: user.name,
    email: user.email,
    groups: fromJson<string[]>(user.groups, []),
    roles,
    permissions: permissionsForRoles(roles),
  };
}

/** The signed-in user (with roles and permissions), or null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const id = await sessionUserId();
  return id ? loadUser(id) : null;
});
