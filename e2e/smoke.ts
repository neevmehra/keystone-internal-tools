/**
 * Browser smoke test. Run against a running app:
 *   SMOKE_BASE_URL=http://localhost:3000 npx tsx e2e/smoke.ts
 *
 * Signs in through the real demo sign-in page as each identity, visits every
 * route in e2e/routes.ts, and fails on server errors, uncaught browser
 * errors, wrong landing pages or missing text. Screenshots go to
 * e2e/artifacts/ (uploaded by CI).
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { SMOKE_ROUTES, type SmokeRoute } from "./routes";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const OUT = path.join(__dirname, "artifacts");
const NAV_TIMEOUT = 120_000; // dev server compiles each route on first visit

// Browser console noise that isn't an app failure.
const IGNORED_CONSOLE = [/favicon/i, /Download the React DevTools/i, /\[HMR\]/, /\[Fast Refresh\]/];

async function signIn(context: BrowserContext, username: string) {
  const page = await context.newPage();
  await page.goto(`${BASE}/sign-in`, { timeout: NAV_TIMEOUT });
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: NAV_TIMEOUT }),
    page.getByRole("button", { name: `Sign in as ${username}` }).click(),
  ]);
  await page.close();
}

async function visit(page: Page, route: SmokeRoute): Promise<string[]> {
  const problems: string[] = [];
  const onPageError = (err: Error) => problems.push(`uncaught browser error: ${err.message}`);
  const onConsole = (msg: { type(): string; text(): string }) => {
    if (msg.type() === "error" && !IGNORED_CONSOLE.some((re) => re.test(msg.text()))) {
      problems.push(`console error: ${msg.text().slice(0, 300)}`);
    }
  };
  page.on("pageerror", onPageError);
  page.on("console", onConsole);

  const response = await page.goto(`${BASE}${route.path}`, { timeout: NAV_TIMEOUT, waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

  const status = response?.status() ?? 0;
  if (status >= 500) problems.push(`HTTP ${status}`);

  // Redirects can finish client-side after "load" (streamed through a loading
  // boundary while the dev server compiles), so give the URL time to settle.
  const expectedPath = route.expectPath ?? route.path.split("?")[0];
  const matches = (u: URL) => (route.expectPathPrefix ? u.pathname.startsWith(route.expectPathPrefix) : u.pathname === expectedPath);
  if (!matches(new URL(page.url()))) await page.waitForURL(matches, { timeout: 30_000 }).catch(() => {});

  const landed = new URL(page.url()).pathname;
  if (route.expectPathPrefix) {
    if (!landed.startsWith(route.expectPathPrefix)) problems.push(`landed on ${landed}, expected ${route.expectPathPrefix}…`);
  } else {
    if (landed !== expectedPath) problems.push(`landed on ${landed}, expected ${expectedPath}`);
  }

  const body = await page.locator("body").innerText().catch(() => "");
  if (/Unhandled Runtime Error|Application error|Internal Server Error/i.test(body)) {
    problems.push("error text rendered on the page");
  }
  if (route.expectText && !body.includes(route.expectText)) problems.push(`missing text "${route.expectText}"`);

  if (route.screenshot) {
    await page.screenshot({ path: path.join(OUT, `${route.screenshot}.png`), fullPage: true });
  }

  page.off("pageerror", onPageError);
  page.off("console", onConsole);
  return problems;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser: Browser = await chromium.launch();
  const failures: string[] = [];

  // One browser context (cookie jar) per identity, signed in once.
  const byUser = new Map<string | null, SmokeRoute[]>();
  for (const r of SMOKE_ROUTES) byUser.set(r.as, [...(byUser.get(r.as) ?? []), r]);

  for (const [username, routes] of byUser) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      if (username) await signIn(context, username);
      const page = await context.newPage();
      for (const route of routes) {
        const label = `${username ?? "signed-out"} ${route.path}`;
        try {
          const problems = await visit(page, route);
          if (problems.length) failures.push(`${label}: ${problems.join("; ")}`);
          console.log(`${problems.length ? "✗" : "✓"} ${label}${problems.length ? `  ${problems.join("; ")}` : ""}`);
        } catch (err) {
          failures.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
          console.log(`✗ ${label}  ${err instanceof Error ? err.message : err}`);
        }
      }
    } catch (err) {
      failures.push(`sign-in as ${username}: ${err instanceof Error ? err.message : String(err)}`);
      console.log(`✗ sign-in as ${username}`);
    } finally {
      await context.close();
    }
  }

  await browser.close();
  if (failures.length) {
    console.error(`\nSmoke test failed (${failures.length}):`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`\nSmoke test passed (${SMOKE_ROUTES.length} routes).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
