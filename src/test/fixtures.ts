import { randomUUID } from "node:crypto";
import type { CurrentUser } from "@/platform/auth/types";
import { db } from "@/platform/db";
import { permissionsForRoles, type Permission, type Role } from "@/platform/rbac/permissions";

export function makeUser(opts: { name?: string; roles?: Role[]; permissions?: Permission[] } = {}): CurrentUser {
  const roles = opts.roles ?? [];
  const id = `usr_${randomUUID()}`;
  return {
    id,
    subject: `test|${id}`,
    name: opts.name ?? "Test User",
    email: `${id}@example.com`,
    groups: [],
    roles,
    permissions: opts.permissions ?? permissionsForRoles(roles),
  };
}

/** Test-only fixture insert (fake data). */
export async function makeCustomer(overrides: Partial<{ riskTier: string; email: string }> = {}) {
  return db.customer.create({
    data: {
      id: `cus_test_${randomUUID()}`,
      name: "Test Customer",
      email: overrides.email ?? "test.customer@example.com",
      phone: "+1-555-000-0000",
      country: "US",
      status: "active",
      riskTier: overrides.riskTier ?? "low",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
  });
}
