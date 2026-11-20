import type { Identity } from "./types";

export type DemoIdentity = Identity & { username: string; purpose: string };

/** Demo identities for AUTH_MODE=mock. Fake people, example.com emails. */
export const DEMO_IDENTITIES: readonly DemoIdentity[] = [
  { username: "maria", name: "Maria Lopez", purpose: "Requests refunds", groups: ["support"] },
  { username: "sam", name: "Sam Okafor", purpose: "Second requester", groups: ["support"] },
  { username: "olivia", name: "Olivia Chen", purpose: "Works the chargebacks queue", groups: ["ops"] },
  { username: "dan", name: "Dan Weber", purpose: "Approves money actions", groups: ["finance-approvers"] },
  { username: "priya", name: "Priya Raman", purpose: "Second approver; requests tool changes", groups: ["finance-approvers"] },
  { username: "chris", name: "Chris Novak", purpose: "Read-only oversight, sees PII", groups: ["compliance"] },
  { username: "alex", name: "Alex Kim", purpose: "Read-only, PII masked, can export audit log", groups: ["auditors"] },
  { username: "admin", name: "Avery Admin", purpose: "Admin console, approves Devin build requests", groups: ["platform-admins"] },
].map((d) => ({ ...d, subject: `demo|${d.username}`, email: `${d.username}@example.com` }));

/** Not a spec persona: shows the "Access not provisioned" page. */
export const UNPROVISIONED_DEMO_IDENTITY: DemoIdentity = {
  username: "contractor",
  name: "Casey Contractor",
  purpose: "In an IdP group with no mapped role",
  groups: ["contractors"],
  subject: "demo|contractor",
  email: "contractor@example.com",
};

export function findDemoIdentity(username: string): DemoIdentity | undefined {
  return [...DEMO_IDENTITIES, UNPROVISIONED_DEMO_IDENTITY].find((d) => d.username === username);
}
