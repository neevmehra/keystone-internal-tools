# Keystone Internal Tools

Keystone is one web app that hosts every internal tool at the company. Employees sign in with company SSO and see only the tools they're provisioned for. Every tool shares the same identity, permissions, field masking, audit trail, approvals and UI, so a new tool is a small module in `src/tools/<slug>/`, not a new codebase.

Keystone replaces the Power Apps runtime with code the team owns, and replaces the studio with Devin: anyone can ask for a tool in plain language, Devin writes it, and an engineer reviews the PR before it goes live. The full brief is in [SPEC.md](./SPEC.md).

**Status:** platform foundation. No business tools yet. The Approvals inbox, Build with Devin request center and Admin console have nav slots that appear once their routes exist.

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

## Run it locally

Requires Node 22.

```bash
npm install
cp .env.example .env          # then set AUTH_SECRET: openssl rand -base64 32
npm run db:reset              # migrate + seed 1,000 customers / 5,000 transactions
npm run dev                   # http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build (`prisma generate` + `next build`, standalone output) |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest (uses a throwaway `prisma/test.db`) |
| `npm run db:reset` | Drop, migrate and seed the dev database |
| `npm run new-tool <slug> "<Name>"` | Scaffold a tool |
| `npm run check:governance` | Governance check (also runs in CI) |

Seed data is fake and deterministic (fixed faker seed; dates are offsets from `SEED_ANCHOR_DATE`, default today UTC).

## Demo identities

With `AUTH_MODE=mock` (the default) the sign-in page lists these identities as cards. Sign-in creates a signed, httpOnly session cookie. Mock mode refuses to run when `NODE_ENV=production`.

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

An extra "contractor" card (group `contractors`, no mapped role) shows the **Access not provisioned** page.

## How it fits together

```
src/platform/auth/          getCurrentUser(), demo sign-in, Auth.js OIDC, group-role-map.ts, JIT provisioning
src/platform/rbac/          permissions.ts (role -> permissions), requirePermission(), maskRecord()
src/platform/actions/       defineAction(): the only way tools write data
src/platform/audit/         recordAudit(), queries. No update or delete.
src/platform/approvals/     requestApproval(), approve(), reject(), execute(), registerExecutor()
src/platform/integrations/  PaymentsClient + FakePaymentsClient
src/platform/ui/            AppShell, DataTable, RecordDetail, ActionForm, StatCards, StatusBadge,
                            EmptyState, AuditTimeline, ApprovalPanel
src/tools/index.ts          Registry of tool manifests (sidebar + portal read it)
templates/tool/             What the scaffold copies
scripts/                    new-tool.ts, check-governance.ts
```

- **Identity.** Both auth modes produce the same identity (subject, name, email, IdP groups). On every sign-in the user is upserted and roles are recomputed from groups, so removing someone from an IdP group removes their access. Unknown groups grant nothing.
- **Permissions.** Strings like `refunds:read`, plus platform ones (`pii:read`, `audit:read`, `audit:export`, `approvals:view`, `admin:read`, `requests:create`, `requests:approve`). `permissions.ts` maps roles to permissions; access changes happen by PR.
- **Writes.** `defineAction` loads the user, checks the permission, validates input with zod, runs inside a transaction and writes the audit event in that same transaction. If anything throws, both roll back.
- **Masking.** `maskRecord(record, piiFields, user)` masks on the server (`m•••@example.com`, `•••• 4242`) for users without `pii:read`. Audit snapshots are masked the same way.
- **Approvals.** Maker-checker: requesters can't decide their own request, deciders need the request's `approvePermission`, executors run at most once per idempotency key (retries reuse it), and every transition is audited.

## Add a tool

```bash
npm run new-tool kyc-review "KYC Review"
```

This is deterministic (no AI). It creates `src/tools/kyc-review/` (manifest, `actions.ts` with one example `defineAction`, queue page with `DataTable`, detail page with `RecordDetail` + `AuditTimeline` + `ApprovalPanel`, `queries.ts`, `__tests__/governance.test.ts`), route stubs in `src/app/(app)/tools/kyc-review/`, registers the manifest in `src/tools/index.ts`, and adds `kyc-review:read` and `kyc-review:write` to `permissions.ts` with no roles. It fails if the slug exists.

Then: grant the permissions to roles, replace the example action and pages with the real ones, add the tool's Prisma models and seed data, and keep the checks green. Rules the governance check enforces:

- Every export in `src/tools/<slug>/actions.ts` is created with `defineAction(`.
- Nothing under `src/tools/` writes through Prisma outside a tool's `actions.ts`.
- Every tool has `manifest.ts`, `__tests__/`, and a registry entry.
- A manifest with `sensitivity: "pii"` or `"money"` lists `piiFields`.

Money amounts are integer cents. Money actions over the tool's `approvalThresholdCents` go through `requestApproval`; executors are registered with `registerExecutor` in `src/tools/<slug>/executors.ts` and imported from `src/tools/executors.ts`. Shared nav slots (`src/platform/ui/nav-config.ts`) are switched on in the PR that adds the route.

In Devin, use the `new-internal-tool` skill.

## Switch to Okta or Entra ID

Set `AUTH_MODE=oidc` and the OIDC variables (see `.env.example`). The redirect URI to register with the IdP is `https://<host>/api/auth/callback/oidc`. OIDC mode is wired but has not been tested against a live IdP.

| IdP | `OIDC_ISSUER` | Groups |
| --- | --- | --- |
| Okta | `https://<org>.okta.com/oauth2/default` | Add a `groups` claim to the authorization server (filter e.g. `Matches regex .*`) and grant the `groups` scope. `OIDC_GROUPS_CLAIM=groups`. |
| Entra ID | `https://login.microsoftonline.com/<tenant-id>/v2.0` | App registration → Token configuration → Add groups claim. Entra emits group object IDs, so map those IDs in `group-role-map.ts` (or emit `sAMAccountName` for synced groups). `OIDC_GROUPS_CLAIM=groups`. Users in 200+ groups get an overage claim instead; use app roles (`OIDC_GROUPS_CLAIM=roles`) in that case. |
| Google Workspace | `https://accounts.google.com` | Google ID tokens don't include groups; use a custom claim via an IdP broker, or map from a directory lookup. |

Then update `src/platform/auth/group-role-map.ts` so your IdP group names map to Keystone roles. Unmapped users land on "Access not provisioned".

## Production notes

- **Build and ship.** `npm run build`, then CI builds the one `Dockerfile` image. The container runs `prisma migrate deploy` then the Next.js standalone server on port 3000. `NODE_ENV=production` requires `AUTH_MODE=oidc`.
- **Database.** Managed Postgres: change `provider` in `prisma/schema.prisma` to `postgresql` and set `DATABASE_URL`. Revoke `UPDATE` and `DELETE` on `"AuditEvent"` for the app's DB role so the log is append-only at the database too: `REVOKE UPDATE, DELETE ON "AuditEvent" FROM keystone_app;`.
- **Secrets.** Environment variables only, from the company's secrets manager (Devin's Secrets settings in Devin sessions). Commit `.env.example`, never `.env`. Nothing secret in the database, code or logs.
- **Topology.** The container on the company's cloud behind SSO, with staging and prod environments. Highly sensitive tools could later get their own deployment, with the platform published as an internal package.
- **Integrations.** `getPaymentsClient()` returns `FakePaymentsClient` today; production needs a real `PaymentsClient` implementation configured from env.

## Honest gaps

- No drag-and-drop builder. Non-engineers request in plain language, but changes wait for engineer review.
- No vendor-attested compliance. The company's SOC 2 scope now includes this app, and it must produce evidence itself.
- The company owns hosting, patching, on-call and upgrades.
- No mobile or offline, and far fewer prebuilt connectors.
- One shared database. Isolate the most sensitive tools if risk warrants it.
