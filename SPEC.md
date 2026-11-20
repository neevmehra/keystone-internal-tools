# Keystone: Internal Tools Platform

Keystone is one web app that hosts every internal tool at the company. Employees sign in with company SSO and see only the tools they're provisioned for. Every tool shares the same identity, permissions, audit trail, approvals and UI, so a new tool is a small module, not a new codebase. Anyone can request a tool or a change in plain language. Devin builds it, and an engineer approves it before it goes live.

## Product brief

**Customer:** Series C fintech, ~60 engineers, ~$250K/year on Microsoft Power Apps for 3 tools (KYC review queue, refunds dashboard, feature-flag admin panel), with 10+ more planned.

**What Power Apps actually sells:** a governed runtime (sign-in, roles, field security, audit, approvals, hosting) plus a studio where non-engineers build apps. Keystone replaces the runtime with code the team owns, and replaces the studio with Devin.

**Product principles**

1. **Governed by construction.** Tool authors can't skip auth, permissions, field masking or audit, because the only way to write data goes through them.
2. **Anyone can ask, an engineer approves.** Non-technical staff request tools in plain language. Devin writes the code, and a human always reviews it before release. That's stronger separation of duties than Power Apps, where a maker can publish alone.
3. **Built for fintech data volumes.** All tables page, sort and filter on the server. No row caps (Power Apps canvas apps silently cut non-delegable queries off at 500 to 2,000 rows).
4. **No per-seat cost, no lock-in.** Plain TypeScript in the company's own Git, CI and cloud.
5. **Honest about gaps.** See the end of this spec.

## Power Apps capability map

| Power Apps | Keystone |
| --- | --- |
| Entra ID sign-in | OIDC sign-in (demo sign-in for the prototype), IdP groups mapped to roles |
| Dataverse security roles | Permissions defined in code, checked on every action |
| Column-level security | Field masking driven by each tool's `piiFields` and the `pii:read` permission |
| Dataverse auditing | Append-only audit log, per-record timeline, audit explorer with export |
| Power Automate approvals | Approvals engine with maker-checker and a unified approvals inbox |
| App sharing and app list | Portal and sidebar show only the tools a user can open |
| Admin center / CoE inventory | Admin console: tool catalog, access matrix, users |
| Copilot / Plan designer | "Build with Devin" request center that launches Devin sessions |
| DLP and Managed Environments | CI governance check, Devin Knowledge rules, PR review |
| Solutions and pipelines | Git, pull requests, CI, one Docker image |
| Connectors | Typed integration clients (payments) with fakes for local dev |
| Model-driven forms and views | UI kit: server-side DataTable, RecordDetail, ActionForm, StatCards |

## Demo identities

| User | IdP group | App role | Purpose |
| --- | --- | --- | --- |
| maria | support | support_agent | Requests refunds |
| sam | support | support_agent | Second requester |
| olivia | ops | ops_analyst | Works the chargebacks queue |
| dan | finance-approvers | finance_approver | Approves money actions |
| priya | finance-approvers | finance_approver | Second approver; requests tool changes |
| chris | compliance | compliance_officer | Read-only oversight, sees PII |
| alex | auditors | auditor | Read-only, PII masked, can export audit log |
| admin | platform-admins | admin | Admin console, approves Devin build requests |

## Stack

- Next.js (App Router) + TypeScript
- Tailwind + shadcn/ui; TanStack Table for data tables
- Prisma on SQLite for local dev, Postgres in production. SQLite has no enums or JSON columns in Prisma, so statuses are strings validated with zod and JSON is stored as text.
- zod for all inputs
- Auth.js for sessions
- Vitest for tests, GitHub Actions for CI
- One `Dockerfile` builds the whole app

npm scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `db:reset` (migrate + seed), `new-tool`, `check:governance`.

## Repo layout

```
src/
  platform/
    auth/          getCurrentUser(), demo sign-in, OIDC config, group-role-map.ts
    rbac/          permissions.ts (role -> permissions), requirePermission(), maskRecord()
    actions/       defineAction()
    audit/         recordAudit(), audit queries (no update/delete)
    approvals/     requestApproval(), approve(), reject(), execute()
    integrations/  PaymentsClient + FakePaymentsClient
    ui/            AppShell, DataTable, RecordDetail, ActionForm, StatCards, StatusBadge,
                   EmptyState, AuditTimeline, ApprovalPanel
  tools/
    index.ts       registry: imports every tool's manifest
    <slug>/        manifest.ts, actions.ts, pages, __tests__/
  app/             portal home, sign-in, audit, approvals, admin, build (request center)
templates/tool/    skeleton the scaffold copies
scripts/           new-tool.ts, check-governance.ts
prisma/            schema.prisma, seed.ts
```

## Platform modules

### Auth

- `AUTH_MODE=mock | oidc`, default `mock`.
- Both modes produce the same identity: subject ID, name, email, IdP groups.
- **mock:** a polished "Demo sign-in" page listing the demo identities as cards with their group. Creates a signed, httpOnly session. Refuses to run when `NODE_ENV=production`.
- **oidc:** Auth.js generic OIDC provider configured by `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_GROUPS_CLAIM`. Wired, not tested. The README explains pointing it at Okta, Entra ID or Google Workspace.
- `group-role-map.ts` maps IdP groups to roles. Unknown groups grant nothing. No mapped role means an "Access not provisioned" page that names the user's groups.
- Just-in-time provisioning: users are upserted into `User` on sign-in, and roles are recomputed from groups every time, so removing someone from an IdP group removes their access.

### Permissions and field security

- Permissions are strings: `<tool>:read`, `<tool>:write`, `<tool>:approve`, plus platform ones: `pii:read`, `audit:read`, `audit:export`, `approvals:view`, `admin:read`, `requests:create`, `requests:approve`.
- `permissions.ts` maps roles to permissions. Access changes happen by PR, which is the change-management record for auditors.
- `requirePermission(user, permission)` throws a typed error.
- `maskRecord(record, piiFields, user)`: users without `pii:read` see masked values (`m•••@example.com`, `•••• 4242`). Masking happens on the server, before data reaches the browser.

### defineAction

Every mutation in every tool is created with:

```ts
export const approveRefund = defineAction({
  tool: "refunds",
  name: "refund.approve",
  permission: "refunds:approve",
  input: zodSchema,
  run: async ({ input, user, tx }) => ({ entityType, entityId, before, after, result }),
});
```

In order: load the user, check the permission, validate input, run inside a transaction, write the audit event in the same transaction, return the result. If anything throws, both the change and the audit event roll back.

### Audit log

- `AuditEvent`: `id, createdAt, actorId, actorName, actorRoles, tool, action, entityType, entityId, before, after, requestId`.
- Append-only. No update or delete exists in code. Production note: revoke UPDATE/DELETE on the table for the app's DB role.
- `AuditTimeline` shows one record's history (who, what, when, field-level before/after diff).

### Approvals engine

- `ApprovalRequest`: `id, tool, actionType, entityType, entityId, payload, amountCents, status (pending | approved | rejected | executed | failed), requestedById, decidedById, decidedAt, reason, approvePermission, idempotencyKey (unique), createdAt`.
- Rules, all tested:
  1. A requester can never approve or reject their own request (the UI hides the buttons too).
  2. The decider needs the request's `approvePermission`.
  3. Thresholds are per-tool config.
  4. Execution runs a registered executor at most once per `idempotencyKey`. Retrying a failure reuses the key.
  5. Every transition is audited.
- `ApprovalPanel` shows status, requester, decider, reason and the approve/reject buttons on a record's detail page.

### Integrations

`PaymentsClient` with `refund({ transactionId, amountCents, idempotencyKey })`. `FakePaymentsClient` records calls, returns the same result for a repeated idempotency key, and fails at the rate set by `FAKE_PAYMENTS_FAIL_RATE`.

### Tool manifest and registry

```ts
export const manifest = {
  slug: "refunds",
  name: "Refunds",
  description: "Request, approve and track customer refunds",
  icon: "ReceiptText",            // lucide icon name
  ownerTeam: "Payments Ops",
  sensitivity: "money",           // "internal" | "pii" | "money"
  readPermission: "refunds:read",
  piiFields: ["customerEmail"],
  nav: [{ label: "Queue", href: "/tools/refunds" }],
};
```

`src/tools/index.ts` imports every manifest. The sidebar, portal home and admin catalog all read from it.

### Scaffold: `npm run new-tool <slug> "<Display Name>"`

Deterministic, no AI. It copies `templates/tool/` to `src/tools/<slug>/`, fills in the names, registers the manifest, and adds `<slug>:read` and `<slug>:write` to `permissions.ts` with no roles yet. It produces: `manifest.ts`, `actions.ts` with one example `defineAction`, a queue page using `DataTable`, a detail page using `RecordDetail`, `AuditTimeline` and `ApprovalPanel`, and `__tests__/governance.test.ts` with the standard tests. It fails if the slug exists. Devin writes everything after that, following the `!new-internal-tool` playbook.

### Governance check (CI)

`scripts/check-governance.ts` fails if:
- an export in `src/tools/*/actions.ts` isn't created with `defineAction(`
- a file under `src/tools/` writes through Prisma outside `actions.ts`
- a tool is missing `manifest.ts` or `__tests__/`, or isn't in the registry
- a manifest's `sensitivity` is `pii` or `money` but `piiFields` is missing

CI runs typecheck, lint, tests and the governance check on every PR.

## Design direction

Calm, dense and professional, in the style of the Stripe Dashboard or Linear. Neutral palette with one accent color, and a clear "DEMO" environment badge.

- **Sidebar:** Home, the user's tools (from the registry), Approvals with a pending count, Build with Devin, Audit (if permitted), Admin (if permitted).
- **Top bar:** signed-in user with group chips, and sign out.
- **Tables:** server-side paging, sorting and filters kept in the URL, so views are shareable links.
- **Polish:** loading skeletons, empty states with a next action, money formatted with currency, relative dates with absolute dates on hover, toast on every action.

## Seed data

Fake data only: 1,000 customers and 5,000 card transactions over the last 90 days. Tools add their own seed data. Seeding is deterministic, so screenshots are repeatable.

## Secrets

Environment variables only. Commit `.env.example`, never `.env`. Nothing secret in the database, in code or in logs. In Devin sessions, secrets come from Devin's Secrets settings. In production, from the company's secrets manager.

## Build and deploy

The same every time: `npm run build`, then CI builds one Docker image. Tools are folders in one app, not separate containers. The README sketches production: the container on the company's cloud behind SSO, managed Postgres, secrets manager, staging and prod. Highly sensitive tools could later get their own deployment, with the platform published as an internal package.

## Honest gaps (keep in README)

- No drag-and-drop builder. Non-engineers request in plain language, but changes wait for engineer review.
- No vendor-attested compliance. The company's SOC 2 scope now includes this app, and it must produce evidence itself.
- The company owns hosting, patching, on-call and upgrades.
- No mobile or offline, and far fewer prebuilt connectors.
- One shared database. Isolate the most sensitive tools if risk warrants it.
