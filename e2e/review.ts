/**
 * UI review run (CI workflow "UI review"). Not a pass/fail gate: it records
 * what a designer would look at, for every screen and for the main flows.
 *
 *   SMOKE_BASE_URL=http://localhost:3000 npx tsx e2e/review.ts
 *
 * Output in e2e/review/out/:
 *   desktop/*.png, mobile/*.png   every screenshot route from e2e/routes.ts
 *   flows/*.png                   step-by-step captures of the main tasks
 *   report.json, REPORT.md        accessibility (axe), layout and timing findings
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { SMOKE_ROUTES } from "./routes";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const OUT = path.join(__dirname, "review", "out");
const NAV_TIMEOUT = 120_000;

type Viewport = { name: "desktop" | "mobile"; width: number; height: number; isMobile?: boolean };
const DESKTOP: Viewport = { name: "desktop", width: 1440, height: 900 };
const MOBILE: Viewport = { name: "mobile", width: 390, height: 844, isMobile: true };

/** Pages also captured on a phone-sized screen. */
const MOBILE_SHOTS = new Set([
  "sign-in",
  "portal-maria",
  "refunds-queue-maria",
  "refunds-request-maria",
  "refund-detail-dan",
  "approvals-dan",
  "chargebacks-queue-olivia",
  "build-request-priya",
  "customer-maria",
  "admin-access-matrix",
  "insights-admin",
  "audit-alex",
]);

type Finding = { page: string; viewport: string; kind: string; detail: string };
const findings: Finding[] = [];
const timings: { page: string; viewport: string; ms: number }[] = [];
const flowLog: { flow: string; step: string; ok: boolean; note?: string; clicks: number }[] = [];

function dir(...p: string[]) {
  const d = path.join(OUT, ...p);
  mkdirSync(d, { recursive: true });
  return d;
}

async function newContext(browser: Browser, options: Parameters<Browser["newContext"]>[0]) {
  const context = await browser.newContext(options);
  // tsx (esbuild keepNames) wraps named functions in __name(); define it in the page.
  await context.addInitScript({ content: "window.__name = (f) => f;" });
  return context;
}

async function signIn(context: BrowserContext, username: string) {
  const page = await context.newPage();
  await page.goto(`${BASE}/sign-in`, { timeout: NAV_TIMEOUT });
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: NAV_TIMEOUT }),
    page.getByRole("button", { name: `Sign in as ${username}` }).click(),
  ]);
  await page.close();
}

/** Layout problems a person would notice: sideways scrolling, clipped text, tiny tap targets. */
async function layoutChecks(page: Page, label: string, vp: Viewport) {
  const result = await page.evaluate(
    ({ mobile }) => {
      const out: { kind: string; detail: string }[] = [];
      const doc = document.documentElement;
      if (doc.scrollWidth > doc.clientWidth + 2) {
        out.push({ kind: "horizontal-scroll", detail: `page is ${doc.scrollWidth}px wide in a ${doc.clientWidth}px viewport` });
      }
      const describe = (el: Element) => {
        const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
        const tag = el.tagName.toLowerCase();
        return `${tag}${el.id ? `#${el.id}` : ""} "${text}"`;
      };
      // Elements wider than the viewport (cause of sideways scroll)
      const vw = doc.clientWidth;
      const wide: string[] = [];
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > vw + 2 && getComputedStyle(el).position !== "fixed") {
          const parent = el.parentElement;
          const pr = parent?.getBoundingClientRect();
          if (!pr || pr.right <= vw + 2) wide.push(describe(el));
        }
        if (wide.length >= 5) break;
      }
      if (wide.length) out.push({ kind: "overflowing-element", detail: wide.join(" | ") });
      // Small tap targets on phones
      if (mobile) {
        const small: string[] = [];
        for (const el of Array.from(document.querySelectorAll("a, button, [role=button], input, select, textarea"))) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && (r.height < 24 || r.width < 24)) small.push(`${describe(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        if (small.length) out.push({ kind: "small-tap-target", detail: `${small.length}: ${small.slice(0, 6).join(" | ")}` });
      }
      // Buttons and links with no accessible name
      const unnamed = Array.from(document.querySelectorAll("button, a")).filter(
        (el) => !(el.textContent ?? "").trim() && !el.getAttribute("aria-label") && !el.getAttribute("title"),
      );
      if (unnamed.length) out.push({ kind: "unnamed-control", detail: `${unnamed.length} buttons/links have no visible or accessible name` });
      return out;
    },
    { mobile: !!vp.isMobile },
  );
  for (const r of result) findings.push({ page: label, viewport: vp.name, ...r });
}

async function axeChecks(page: Page, label: string, vp: Viewport) {
  try {
    const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    for (const v of res.violations) {
      findings.push({
        page: label,
        viewport: vp.name,
        kind: `a11y:${v.id}`,
        detail: `${v.impact ?? "minor"}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(" ")}`,
      });
    }
  } catch (err) {
    findings.push({ page: label, viewport: vp.name, kind: "axe-error", detail: String(err).slice(0, 200) });
  }
}

async function capturePages(browser: Browser, vp: Viewport) {
  const routes = SMOKE_ROUTES.filter((r) => r.screenshot && (vp.name === "desktop" || MOBILE_SHOTS.has(r.screenshot)));
  const byUser = new Map<string | null, typeof routes>();
  for (const r of routes) byUser.set(r.as, [...(byUser.get(r.as) ?? []), r]);
  const outDir = dir(vp.name);
  for (const [username, list] of byUser) {
    const context = await newContext(browser, { viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile });
    try {
      if (username) await signIn(context, username);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      for (const r of list) {
        const label = r.screenshot!;
        const t0 = Date.now();
        await page.goto(`${BASE}${r.path}`, { timeout: NAV_TIMEOUT });
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        // Second visit timing (first visit includes dev-server compile time)
        const t1 = Date.now();
        await page.reload({ timeout: NAV_TIMEOUT });
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        timings.push({ page: label, viewport: vp.name, ms: Date.now() - t1 });
        void t0;
        await page.screenshot({ path: path.join(outDir, `${label}.png`), fullPage: true });
        await layoutChecks(page, label, vp);
        if (vp.name === "desktop") await axeChecks(page, label, vp);
        if (errors.length) findings.push({ page: label, viewport: vp.name, kind: "browser-error", detail: errors.splice(0).join(" | ").slice(0, 300) });
      }
    } catch (err) {
      findings.push({ page: `as ${username}`, viewport: vp.name, kind: "capture-failed", detail: String(err).slice(0, 300) });
    } finally {
      await context.close();
    }
  }
}

/** A scripted task. Each step counts clicks and captures the screen after it. */
async function flow(browser: Browser, name: string, as: string, steps: (s: Stepper) => Promise<void>) {
  const context = await newContext(browser, { viewport: { width: DESKTOP.width, height: DESKTOP.height } });
  const outDir = dir("flows");
  let n = 0;
  let clicks = 0;
  const page = await context.newPage();
  const s: Stepper = {
    page,
    click: async (locator) => {
      clicks++;
      await locator.click({ timeout: 15_000 });
    },
    step: async (label, fn) => {
      n++;
      const before = clicks;
      try {
        await fn();
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(400);
        flowLog.push({ flow: name, step: label, ok: true, clicks: clicks - before });
      } catch (err) {
        flowLog.push({ flow: name, step: label, ok: false, note: String(err).split("\n")[0].slice(0, 240), clicks: clicks - before });
        findings.push({ page: `flow:${name}`, viewport: "desktop", kind: "flow-step-failed", detail: `${label}: ${String(err).split("\n")[0].slice(0, 200)}` });
      }
      await page.screenshot({ path: path.join(outDir, `${name}-${String(n).padStart(2, "0")}-${label.replace(/\W+/g, "-").toLowerCase()}.png`), fullPage: true });
    },
  };
  try {
    await signIn(context, as);
    await steps(s);
  } catch (err) {
    findings.push({ page: `flow:${name}`, viewport: "desktop", kind: "flow-failed", detail: String(err).slice(0, 300) });
  } finally {
    flowLog.push({ flow: name, step: "TOTAL", ok: true, clicks });
    await context.close();
  }
}

type Stepper = {
  page: Page;
  click: (locator: ReturnType<Page["locator"]>) => Promise<void>;
  step: (label: string, fn: () => Promise<void>) => Promise<void>;
};

async function flows(browser: Browser) {
  // 1. Support agent requests a refund over the approval threshold, starting from the portal.
  await flow(browser, "maria-request-refund", "maria", async ({ page, click, step }) => {
    await step("portal", async () => {
      await page.goto(`${BASE}/`, { timeout: NAV_TIMEOUT });
    });
    await step("open refunds", async () => {
      await click(page.getByRole("link", { name: /refunds/i }).first());
      await page.waitForURL(/\/tools\/refunds/, { timeout: NAV_TIMEOUT });
    });
    await step("start new request", async () => {
      await click(page.getByRole("link", { name: /new refund|request refund|new request/i }).first());
      await page.waitForURL(/\/tools\/refunds\/new/, { timeout: NAV_TIMEOUT });
    });
    await step("find transaction", async () => {
      await page.getByLabel("Find a transaction").fill("txn_000021");
      await click(page.getByRole("button", { name: "Find", exact: true }));
      await page.getByText("txn_000021").first().waitFor({ timeout: 30_000 });
    });
    await step("choose transaction", async () => {
      await click(page.getByRole("link", { name: "Refund", exact: true }).first());
      await page.getByRole("button", { name: "Request refund" }).waitFor({ timeout: 30_000 });
    });
    await step("fill and submit", async () => {
      const amount = page.getByLabel(/amount/i).first();
      await amount.fill("250");
      const reason = page.getByLabel(/reason/i).first();
      const tag = await reason.evaluate((el) => el.tagName.toLowerCase());
      if (tag === "select") await reason.selectOption({ index: 1 });
      else {
        await click(reason);
        await click(page.getByRole("option").first());
      }
      const note = page.getByLabel(/note/i);
      if (await note.count()) await note.first().fill("Customer was double charged.");
      await click(page.getByRole("button", { name: "Request refund" }));
      await page.waitForTimeout(2500);
    });
  });

  // 2. Finance approver works the inbox.
  await flow(browser, "dan-approve-from-inbox", "dan", async ({ page, click, step }) => {
    await step("portal", async () => {
      await page.goto(`${BASE}/`, { timeout: NAV_TIMEOUT });
    });
    await step("open notifications", async () => {
      await click(page.getByRole("button", { name: /notifications/i }).first());
    });
    await step("open approvals", async () => {
      await page.keyboard.press("Escape");
      await click(page.getByRole("link", { name: /^approvals/i }).first());
      await page.waitForURL(/\/approvals/, { timeout: NAV_TIMEOUT });
    });
    await step("approve first", async () => {
      const reason = page.getByLabel("Reason").first();
      if (await reason.count()) await reason.fill("Looks right.");
      await click(page.getByRole("button", { name: /^approve$/i }).first());
      await page.waitForTimeout(2500);
    });
  });

  // 3. Ops analyst works a dispute end to end.
  await flow(browser, "olivia-work-dispute", "olivia", async ({ page, click, step }) => {
    await step("queue", async () => {
      await page.goto(`${BASE}/tools/chargebacks`, { timeout: NAV_TIMEOUT });
    });
    await step("open first unassigned", async () => {
      await click(page.locator("table tbody tr").first());
      await page.waitForURL(/\/tools\/chargebacks\/dsp_/, { timeout: NAV_TIMEOUT });
    });
    await step("pick up", async () => {
      const btn = page.getByRole("button", { name: "Pick up" });
      if (await btn.count()) await click(btn);
      await page.waitForTimeout(2000);
    });
    await step("save evidence note", async () => {
      await page.locator("textarea").first().fill("Sent delivery confirmation and signed receipt.");
      await click(page.getByRole("button", { name: "Save note" }));
      await page.waitForTimeout(2000);
    });
    await step("mark won", async () => {
      await click(page.getByRole("button", { name: "Mark won" }));
      await page.waitForTimeout(2000);
    });
  });

  // 4. Global search from the keyboard.
  await flow(browser, "maria-command-search", "maria", async ({ page, click, step }) => {
    await step("portal", async () => {
      await page.goto(`${BASE}/`, { timeout: NAV_TIMEOUT });
    });
    await step("open search with keyboard", async () => {
      await page.keyboard.press("ControlOrMeta+k");
      await page.getByPlaceholder(/customer, transaction/i).waitFor({ timeout: 10_000 });
    });
    await step("type a transaction id", async () => {
      await page.getByPlaceholder(/customer, transaction/i).fill("txn_000021");
      await page.waitForTimeout(1500);
    });
    await step("open result", async () => {
      await page.keyboard.press("Enter");
      await page.waitForTimeout(3000);
    });
    void click;
  });

  // 5. Finance user asks Devin for a change.
  await flow(browser, "priya-request-change", "priya", async ({ page, click, step }) => {
    await step("open build", async () => {
      await page.goto(`${BASE}/`, { timeout: NAV_TIMEOUT });
      await click(page.getByRole("link", { name: /build with devin/i }).first());
      await page.waitForURL(/\/build/, { timeout: NAV_TIMEOUT });
    });
    await step("change tab", async () => {
      await click(page.getByRole("link", { name: /change a tool/i }).or(page.getByRole("tab", { name: /change a tool/i })).first());
    });
    await step("fill request", async () => {
      const tool = page.getByLabel("Tool to change");
      const tag = await tool.evaluate((el) => el.tagName.toLowerCase());
      if (tag === "select") await tool.selectOption({ index: 1 });
      else {
        await click(tool);
        await click(page.getByRole("option").first());
      }
      await page.getByLabel("Title").fill("Filter refunds by reason and export CSV");
      const problem = page.getByLabel("Problem");
      if (await problem.count()) await problem.fill("Month-end close needs a list of refunds by reason.");
      const change = page.locator("textarea").last();
      await change.fill("Can my team filter refunds by reason and download the current list as a CSV for month-end close? Only finance should be able to download it.");
      const people = page.getByLabel("People");
      if (await people.count()) await people.fill("4");
      const hours = page.getByLabel("Hours per week");
      if (await hours.count()) await hours.fill("3");
    });
    await step("submit", async () => {
      await click(page.getByRole("button", { name: /submit|send to devin|request/i }).last());
      await page.waitForTimeout(3000);
    });
  });

  // 6. Mobile: a support agent checks a refund on a phone.
  {
    const context = await newContext(browser, { viewport: { width: MOBILE.width, height: MOBILE.height }, isMobile: true, hasTouch: true });
    const outDir = dir("flows");
    try {
      await signIn(context, "maria");
      const page = await context.newPage();
      await page.goto(`${BASE}/`, { timeout: NAV_TIMEOUT });
      await page.screenshot({ path: path.join(outDir, "mobile-maria-01-portal.png") });
      const menu = page.getByRole("button", { name: /menu|navigation|sidebar/i }).first();
      if (await menu.count()) {
        await menu.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(outDir, "mobile-maria-02-menu-open.png") });
        flowLog.push({ flow: "mobile-nav", step: "open menu", ok: true, clicks: 1 });
      } else {
        findings.push({ page: "flow:mobile-nav", viewport: "mobile", kind: "no-mobile-menu", detail: "no button named menu/navigation found on a 390px screen" });
        flowLog.push({ flow: "mobile-nav", step: "open menu", ok: false, note: "no menu button", clicks: 0 });
      }
    } catch (err) {
      findings.push({ page: "flow:mobile-nav", viewport: "mobile", kind: "flow-failed", detail: String(err).slice(0, 200) });
    } finally {
      await context.close();
    }
  }
}

function writeReport() {
  const slow = timings.filter((t) => t.ms > 2500).sort((a, b) => b.ms - a.ms);
  const byKind = new Map<string, Finding[]>();
  for (const f of findings) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);
  const lines: string[] = ["# UI review", "", `Base: ${BASE}`, "", "## Flows", "", "| Flow | Step | OK | Clicks | Note |", "| --- | --- | --- | --- | --- |"];
  for (const s of flowLog) lines.push(`| ${s.flow} | ${s.step} | ${s.ok ? "yes" : "NO"} | ${s.clicks} | ${s.note ?? ""} |`);
  lines.push("", "## Findings by kind", "");
  for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`### ${kind} (${list.length})`, "");
    for (const f of list) lines.push(`- **${f.page}** (${f.viewport}): ${f.detail}`);
    lines.push("");
  }
  lines.push("## Slow pages (warm reload over 2.5s)", "");
  for (const t of slow) lines.push(`- ${t.page} (${t.viewport}): ${t.ms}ms`);
  writeFileSync(path.join(OUT, "REPORT.md"), lines.join("\n"));
  writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ findings, timings, flows: flowLog }, null, 2));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  await capturePages(browser, DESKTOP);
  await capturePages(browser, MOBILE);
  await flows(browser);
  await browser.close();
  writeReport();
  console.log(`UI review done: ${findings.length} findings, ${flowLog.filter((s) => !s.ok).length} failed flow steps.`);
}

main().catch((err) => {
  console.error(err);
  writeReport();
  process.exit(1);
});
