import type { Permission } from "@/platform/rbac/permissions";

/** Admin console sections and the permission each one needs (the console itself needs admin:read). */
export const ADMIN_SECTIONS: ReadonlyArray<{ href: string; label: string; permission: Permission; description: string }> = [
  { href: "/admin/tools", label: "Tool catalog", permission: "admin:read", description: "Every tool, its owner, sensitivity and who can do what." },
  { href: "/admin/access", label: "Access", permission: "admin:read", description: "Roles by permissions, IdP group mapping, and every user." },
  {
    href: "/admin/access-reviews",
    label: "Access reviews",
    permission: "access_reviews:manage",
    description: "Periodic keep-or-revoke review of every user's access.",
  },
  { href: "/admin/evidence", label: "Evidence pack", permission: "audit:export", description: "One ZIP with everything an auditor asks for." },
];
