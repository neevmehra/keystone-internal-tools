import { recordAudit } from "@/platform/audit";
import { db } from "@/platform/db";
import { fromJson } from "@/platform/json";
import { rolesForGroups } from "./group-role-map";
import type { Identity } from "./types";

/**
 * Just-in-time provisioning: upsert the user on every sign-in and recompute
 * roles from IdP groups, so removing someone from a group removes access.
 */
export async function provisionUser(identity: Identity) {
  const groups = [...new Set(identity.groups)].sort();
  const roles = rolesForGroups(groups);
  return db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { subject: identity.subject } });
    const data = {
      email: identity.email,
      name: identity.name,
      groups: JSON.stringify(groups),
      roles: JSON.stringify(roles),
      lastLoginAt: new Date(),
    };
    const user = await tx.user.upsert({
      where: { subject: identity.subject },
      create: { subject: identity.subject, ...data },
      update: data,
    });
    await recordAudit(tx, {
      actor: { id: user.id, name: user.name, roles },
      tool: "platform",
      action: "auth.sign_in",
      entityType: "User",
      entityId: user.id,
      before: existing ? { groups: fromJson(existing.groups, []), roles: fromJson(existing.roles, []) } : null,
      after: { groups, roles },
    });
    return user;
  });
}
