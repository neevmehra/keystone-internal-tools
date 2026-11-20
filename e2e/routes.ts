/**
 * Smoke routes: every page in the app, visited as a real demo identity
 * through the real sign-in page. CI fails if a page errors, returns 5xx,
 * or lands somewhere other than `expectPath`.
 *
 * When you add a page, add it here. Add `screenshot` for pages worth
 * showing in a demo; screenshots are uploaded as a CI artifact.
 */
export type SmokeRoute = {
  /** Demo username, or null to visit signed out. */
  as: string | null;
  path: string;
  /** Where the browser should end up. Defaults to `path` (query string ignored). */
  expectPath?: string;
  /** Text that must appear on the page. */
  expectText?: string;
  /** File name (without .png) for a full-page screenshot. */
  screenshot?: string;
};

export const SMOKE_ROUTES: SmokeRoute[] = [
  // Signed out
  { as: null, path: "/", expectPath: "/sign-in", screenshot: "sign-in" },

  // Portal home per role
  { as: "maria", path: "/", screenshot: "portal-maria" },
  { as: "alex", path: "/", screenshot: "portal-alex" },
  { as: "admin", path: "/", screenshot: "portal-admin" },

  // Audit log
  { as: "alex", path: "/audit", expectText: "Audit", screenshot: "audit-alex" },
  { as: "maria", path: "/audit", expectPath: "/forbidden" },

  // Refunds. ref_demo_pending is maria's seeded $250.00 refund awaiting approval;
  // txn_000021 is a settled transaction the seed never refunds.
  { as: "maria", path: "/tools/refunds", expectText: "Pending approval", screenshot: "refunds-queue-maria" },
  { as: "maria", path: "/tools/refunds/new?q=txn_00002", expectText: "txn_000021", screenshot: "refunds-lookup-maria" },
  { as: "maria", path: "/tools/refunds/new?transactionId=txn_000021", expectText: "Request refund", screenshot: "refunds-request-maria" },
  { as: "maria", path: "/tools/refunds/ref_demo_pending", expectText: "You can't approve your own request", screenshot: "refund-detail-maria" },
  { as: "dan", path: "/tools/refunds", screenshot: "refunds-queue-dan" },
  { as: "dan", path: "/tools/refunds/ref_demo_pending", expectText: "Approve", screenshot: "refund-detail-dan" },
  { as: "dan", path: "/tools/refunds/new", expectPath: "/forbidden" },
  { as: "alex", path: "/tools/refunds/ref_demo_pending", expectText: "•••@", screenshot: "refund-detail-alex-masked" },
  { as: "alex", path: "/tools/refunds?status=executed", expectText: "Executed" },

  // Unprovisioned identity
  { as: "contractor", path: "/", expectPath: "/access-not-provisioned", screenshot: "access-not-provisioned" },
];
