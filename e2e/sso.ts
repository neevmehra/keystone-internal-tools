/**
 * Real SSO end to end: Keystone (AUTH_MODE=oidc) signing in through Keycloak.
 *
 *   docker compose up -d keycloak
 *   AUTH_MODE=oidc OIDC_ISSUER=http://localhost:8080/realms/keystone \
 *   OIDC_CLIENT_ID=keystone OIDC_CLIENT_SECRET=keystone-dev-secret npm run dev
 *   npx tsx e2e/sso.ts
 *
 * For each user: open Keystone, click "Continue with company SSO", log in on
 * Keycloak's own login page, and check that Keystone provisions the user from
 * the ID token's groups claim and shows the right role-gated content.
 * Screenshots go to e2e/artifacts/.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const OUT = path.join(__dirname, "artifacts");
const TIMEOUT = 120_000;

type Check = {
  username: string;
  /** Where Keystone should land after the IdP redirects back. */
  expectPath: string;
  /** Text that must appear once signed in. */
  expectText: string[];
  /** A page this user can open, to prove the session sticks. */
  alsoVisit?: { path: string; expectText: string };
  screenshot: string;
};

const CHECKS: Check[] = [
  {
    username: "maria",
    expectPath: "/",
    expectText: ["Maria Lopez", "Refunds"],
    alsoVisit: { path: "/tools/refunds", expectText: "Pending approval" },
    screenshot: "sso-portal-maria",
  },
  {
    username: "dan",
    expectPath: "/",
    expectText: ["Dan Weber", "Approvals"],
    alsoVisit: { path: "/approvals", expectText: "Approvals" },
    screenshot: "sso-portal-dan",
  },
  {
    // In an IdP group with no mapped role.
    username: "contractor",
    expectPath: "/access-not-provisioned",
    expectText: ["Access not provisioned", "contractors"],
    screenshot: "sso-access-not-provisioned",
  },
];

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`uncaught browser error: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error" || !page.url().startsWith(BASE)) return;
    if (/favicon|React DevTools|\[HMR\]|\[Fast Refresh\]/i.test(msg.text())) return;
    errors.push(`console error: ${msg.text().slice(0, 300)}`);
  });
  return errors;
}

async function bodyText(page: Page) {
  return page.locator("body").innerText().catch(() => "");
}

async function run(check: Check, first: boolean): Promise<string[]> {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const problems = watchErrors(page);
  try {
    await page.goto(`${BASE}/sign-in`, { timeout: TIMEOUT });
    await Promise.all([
      page.waitForURL((u) => u.port === "8080", { timeout: TIMEOUT }),
      page.getByRole("button", { name: "Continue with company SSO" }).click(),
    ]);

    // Keycloak's login page, served by the IdP, not by Keystone.
    await page.locator("#username").waitFor({ timeout: TIMEOUT });
    if (first) await page.screenshot({ path: path.join(OUT, "sso-keycloak-login.png"), fullPage: true });
    await page.locator("#username").fill(check.username);
    await page.locator("#password").fill(check.username);
    await Promise.all([
      page.waitForURL((u) => u.origin === new URL(BASE).origin && !u.pathname.startsWith("/api/auth"), { timeout: TIMEOUT }),
      page.locator("#kc-login").click(),
    ]);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

    const landed = new URL(page.url()).pathname;
    if (landed !== check.expectPath) problems.push(`landed on ${landed}, expected ${check.expectPath}`);
    const text = await bodyText(page);
    for (const t of check.expectText) if (!text.includes(t)) problems.push(`missing text "${t}"`);
    await page.screenshot({ path: path.join(OUT, `${check.screenshot}.png`), fullPage: true });

    if (check.alsoVisit) {
      const res = await page.goto(`${BASE}${check.alsoVisit.path}`, { timeout: TIMEOUT });
      const at = new URL(page.url()).pathname;
      if ((res?.status() ?? 0) >= 500) problems.push(`${check.alsoVisit.path}: HTTP ${res?.status()}`);
      if (at !== check.alsoVisit.path) problems.push(`${check.alsoVisit.path}: landed on ${at} (session not kept?)`);
      // The dev server may still be streaming the page on first compile; give it time.
      await page.getByText(check.alsoVisit.expectText).first().waitFor({ timeout: 30_000 }).catch(() => {});
      if (!(await bodyText(page)).includes(check.alsoVisit.expectText)) {
        problems.push(`${check.alsoVisit.path}: missing text "${check.alsoVisit.expectText}"`);
      }
    }
  } catch (err) {
    problems.push(err instanceof Error ? err.message : String(err));
    await page.screenshot({ path: path.join(OUT, `${check.screenshot}-failure.png`), fullPage: true }).catch(() => {});
    problems.push(`stopped at ${page.url()}`);
  } finally {
    await browser.close();
  }
  return problems;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const failures: string[] = [];
  for (const [i, check] of CHECKS.entries()) {
    const problems = await run(check, i === 0);
    console.log(`${problems.length ? "✗" : "✓"} SSO sign-in as ${check.username}${problems.length ? `  ${problems.join("; ")}` : ""}`);
    for (const p of problems) failures.push(`${check.username}: ${p}`);
  }
  if (failures.length) {
    console.error(`\nSSO test failed (${failures.length}):`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`\nSSO test passed (${CHECKS.length} users through Keycloak).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
