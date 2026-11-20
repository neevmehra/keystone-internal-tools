import { PermissionDeniedError, UnauthenticatedError } from "@/platform/errors";
import type { Permission } from "./permissions";

export * from "./permissions";
export { maskRecord, maskRecords, maskValue, MASK } from "./mask";

export type PermissionHolder = { permissions: readonly string[] };

export function hasPermission(user: PermissionHolder | null | undefined, permission: Permission | string): boolean {
  return !!user && user.permissions.includes(permission);
}

export function requirePermission<U extends PermissionHolder>(
  user: U | null | undefined,
  permission: Permission | string,
): asserts user is U {
  if (!user) throw new UnauthenticatedError();
  if (!hasPermission(user, permission)) throw new PermissionDeniedError(permission);
}
