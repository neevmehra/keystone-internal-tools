/**
 * Platform nav slots. A slot only renders once its route exists: flip
 * `enabled` in the same PR that adds the page (a test checks they match).
 */
export const PLATFORM_ROUTES = {
  approvals: { href: "/approvals", label: "Approvals", enabled: true, permission: "approvals:view" },
  insights: { href: "/insights", label: "Insights", enabled: true, permission: "approvals:view" },
  build: { href: "/build", label: "Build with Devin", enabled: false, permission: "requests:create" },
  audit: { href: "/audit", label: "Audit", enabled: true, permission: "audit:read" },
  admin: { href: "/admin", label: "Admin", enabled: false, permission: "admin:read" },
} as const;
