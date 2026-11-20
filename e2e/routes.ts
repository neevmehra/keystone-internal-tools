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
  /** Like expectPath, for redirects to a record whose ID the seed decides (e.g. "/customers/"). */
  expectPathPrefix?: string;
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

  // Approvals inbox and insights
  { as: "dan", path: "/approvals", expectText: "Approvals", screenshot: "approvals-dan" },
  { as: "dan", path: "/approvals?tab=decided", expectText: "Decided by me" },
  { as: "priya", path: "/approvals?tab=mine", expectText: "Waiting on someone else", screenshot: "approvals-priya-own-request" },
  { as: "maria", path: "/approvals", expectPath: "/forbidden" },
  { as: "admin", path: "/insights", expectText: "self-approved", screenshot: "insights-admin" },
  { as: "maria", path: "/insights", expectPath: "/forbidden" },

  // Admin and compliance
  { as: "admin", path: "/admin", expectText: "Access reviews", screenshot: "admin-overview" },
  { as: "admin", path: "/admin/tools", screenshot: "admin-tool-catalog" },
  { as: "admin", path: "/admin/access", expectText: "Access matrix", screenshot: "admin-access-matrix" },
  { as: "chris", path: "/admin/access-reviews", expectText: "Reviews", screenshot: "access-reviews" },
  { as: "chris", path: "/admin/access-reviews/current", expectText: "Stale accounts", screenshot: "access-review-in-progress" },
  { as: "alex", path: "/admin/evidence", expectText: "Download evidence pack", screenshot: "evidence-pack" },
  { as: "alex", path: "/audit?tool=platform", expectText: "Changes", screenshot: "audit-diffs" },
  { as: "maria", path: "/admin", expectPath: "/forbidden" },
  { as: "alex", path: "/admin/access-reviews", expectPath: "/forbidden" },

  // Chargebacks (dsp_000001: olivia marked it lost; write-off awaits finance)
  { as: "olivia", path: "/tools/chargebacks", expectText: "Due this week", screenshot: "chargebacks-queue-olivia" },
  { as: "olivia", path: "/tools/chargebacks?status=all&sort=resolvedAt&dir=desc", expectPath: "/tools/chargebacks" },
  { as: "olivia", path: "/tools/chargebacks/dsp_000001", expectText: "Waiting for someone else to approve" },
  { as: "dan", path: "/tools/chargebacks/dsp_000001", expectText: "Approve", screenshot: "chargebacks-writeoff-dan" },
  { as: "alex", path: "/tools/chargebacks", expectText: "•••@", screenshot: "chargebacks-queue-alex-masked" },
  { as: "alex", path: "/tools/chargebacks/dsp_000001", expectText: "•••@", screenshot: "chargebacks-detail-alex-masked" },
  { as: "chris", path: "/tools/chargebacks/dsp_000001", expectText: "Evidence sent" },
  { as: "maria", path: "/tools/chargebacks", expectPath: "/forbidden" },

  // Build with Devin (request center)
  { as: "priya", path: "/build", expectText: "Preview what Devin will receive", screenshot: "build-request-priya" },
  { as: "priya", path: "/build?tab=change", expectPath: "/build", screenshot: "build-change-request-priya" },
  { as: "priya", path: "/build/requests", expectText: "My requests", screenshot: "build-requests-priya" },
  { as: "priya", path: "/build/requests/treq_seed_04", expectText: "Ready to launch (simulation)", screenshot: "build-request-simulation-priya" },
  { as: "admin", path: "/build/requests", expectText: "All requests", screenshot: "build-requests-admin" },
  { as: "admin", path: "/build/requests/treq_seed_06", expectText: "Waiting for approval", screenshot: "build-request-pending-admin" },
  { as: "admin", path: "/build/impact", expectText: "Equivalent Power Apps seats", screenshot: "build-impact-admin" },
  { as: "maria", path: "/build/impact", expectPath: "/forbidden" },

  // Customer view and global search. Seeded IDs are random per customer, so
  // these open the customer behind a known record (?open=customer redirects).
  { as: "maria", path: "/search?q=ref_demo_pending&open=customer", expectPathPrefix: "/customers/cus_", expectText: "Activity", screenshot: "customer-maria" },
  { as: "alex", path: "/search?q=dsp_000001&open=customer", expectPathPrefix: "/customers/cus_", expectText: "•••", screenshot: "customer-alex-masked" },
  { as: "olivia", path: "/search?q=dsp_000001&open=customer", expectPathPrefix: "/customers/cus_", expectText: "Chargebacks" },
  { as: "chris", path: "/search?q=txn_00002", expectText: "Transaction", screenshot: "search-chris" },
  // Maria can't read chargebacks, so a dispute ID finds nothing and doesn't redirect.
  { as: "maria", path: "/search?q=dsp_000001&open=customer", expectPath: "/search", expectText: "No matches" },
  // Auditors can't search by email (PII).
  { as: "alex", path: "/search?q=maria%40example.com", expectText: "needs PII access" },
  { as: "contractor", path: "/customers/cus_00001", expectPath: "/access-not-provisioned" },

  // Unprovisioned identity
  { as: "contractor", path: "/", expectPath: "/access-not-provisioned", screenshot: "access-not-provisioned" },
];
