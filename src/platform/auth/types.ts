import type { Permission, Role } from "@/platform/rbac/permissions";

/** What both auth modes produce. */
export type Identity = {
  subject: string;
  name: string;
  email: string;
  groups: string[];
};

export type CurrentUser = {
  id: string;
  subject: string;
  name: string;
  email: string;
  groups: string[];
  roles: Role[];
  permissions: Permission[];
};
