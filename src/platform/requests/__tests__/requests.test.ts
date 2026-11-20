import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { approve, execute, reject } from "@/platform/approvals";
import { getCurrentUser } from "@/platform/auth/current-user";
import { db } from "@/platform/db";
import { SelfApprovalError } from "@/platform/errors";
import { fromJson } from "@/platform/json";
import { getRequest } from "@/platform/requests";
import { HttpDevinClient, parseSession, setDevinClientForTests, simulatedRequest, buildSessionBody, type DevinClient } from "@/platform/requests/devin";
import { launchForRequest } from "@/platform/requests/executor";
import { computeImpact } from "@/platform/requests/impact";
import { submitToolRequest } from "@/platform/requests/mutations";
import { buildDevinPrompt, SKILL_LINE } from "@/platform/requests/prompt";
import { displayStatus, timeline } from "@/platform/requests/status";
import { makeUser } from "@/test/fixtures";
import { seedToolRequests } from "../../../../prisma/seed-requests";

vi.mock("@/platform/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
const asUser = (user: Awaited<ReturnType<typeof getCurrentUser>>) => vi.mocked(getCurrentUser).mockResolvedValue(user);

const priya = { ...makeUser({ name: "Priya Raman", roles: ["finance_approver"] }), groups: ["finance-approvers"] };
const admin = { ...makeUser({ name: "Avery Admin", roles: ["admin"] }), groups: ["platform-admins"] };
const SECRET = "cog_test_secret_key_never_shown_123";

const sample = {
  kind: "new_tool" as const,
  title: "Month-end reconciliation board",
  problem: "Matching processor payouts to the ledger happens in a spreadsheet.",
  audienceGroups: ["finance-approvers", "ops"],
  workflow: "List payouts, show breaks, assign each break, resolve with a note.",
  signOff: "Finance approves write-offs",
  signOffAboveCents: 100_000,
  involvesPii: false,
  movesMoney: true,
  peopleCount: 4,
  hoursPerWeek: 3,
};

async function submit(user = priya) {
  asUser(user);
  const res = await submitToolRequest(sample);
  if (!res.ok) throw new Error(res.error.message);
  const req = await db.toolRequest.findUniqueOrThrow({ where: { id: res.result.id } });
  return req;
}

const fetchSpy = vi.fn(() => {
  throw new Error("network call in a test");
});

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubEnv("DEVIN_API_KEY", "");
  vi.stubEnv("DEVIN_ORG_ID", "");
  fetchSpy.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  setDevinClientForTests(null);
});

describe("prompt builder", () => {
  it("starts with the org skill and carries the requester's answers", () => {
    const prompt = buildDevinPrompt(sample, { name: "Priya Raman", groups: ["finance-approvers"] });
    const lines = prompt.split("\n");
    expect(lines[0]).toBe(SKILL_LINE);
    expect(lines[0]).toBe("@skills:new-internal-tool");
    expect(prompt).toContain("Keystone request: Month-end reconciliation board");
    expect(prompt).toContain("Type: New tool");
    expect(prompt).toContain("Requested by: Priya Raman (IdP groups: finance-approvers)");
    expect(prompt).toContain("Who will use it (IdP groups): finance-approvers, ops");
    expect(prompt).toContain("Sign-off: Finance approves write-offs Required above $1,000.");
    expect(prompt).toContain("Moves money: yes, route it through the approvals engine");
    expect(prompt).toContain("Today: 4 people, about 3 hours a week in total.");
    expect(prompt).toContain("Run the scaffold first");
    expect(prompt).not.toContain("playbook");
  });

  it("names the target tool for a change", () => {
    const prompt = buildDevinPrompt({ ...sample, kind: "change_tool", toolSlug: "refunds", toolName: "Refunds" }, { name: "Priya", groups: [] });
    expect(prompt).toContain("Type: Change to an existing tool: Refunds (slug: refunds)");
    expect(prompt).toContain("Work in src/tools/refunds/");
  });
});

describe("submitting a request", () => {
  it("creates the request, its approval and an audit event, waiting for an admin", async () => {
    const req = await submit();
    expect(req.status).toBe("submitted");
    expect(req.prompt.split("\n")[0]).toBe(SKILL_LINE);
    const approval = await db.approvalRequest.findUniqueOrThrow({ where: { id: req.approvalRequestId! } });
    expect(approval).toMatchObject({ status: "pending", approvePermission: "requests:approve", entityType: "ToolRequest", entityId: req.id });
    expect(await db.auditEvent.count({ where: { entityType: "ToolRequest", entityId: req.id, action: "build.request.submit" } })).toBe(1);
  });

  it("rejects a change to a tool that doesn't exist", async () => {
    asUser(priya);
    const res = await submitToolRequest({ ...sample, kind: "change_tool", toolSlug: "no-such-tool" });
    expect(res).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  });

  it("never lets the requester approve their own request", async () => {
    const req = await submit(admin); // admin holds requests:approve
    await expect(approve(admin, req.approvalRequestId!)).rejects.toBeInstanceOf(SelfApprovalError);
    await expect(reject(admin, req.approvalRequestId!, { reason: "no" })).rejects.toBeInstanceOf(SelfApprovalError);
    expect((await db.approvalRequest.findUniqueOrThrow({ where: { id: req.approvalRequestId! } })).status).toBe("pending");
  });
});

describe("launching a Devin session", () => {
  it("simulation mode makes no network calls and records the exact request", async () => {
    const req = await submit();
    await approve(admin, req.approvalRequestId!);
    const outcome = await execute(admin, req.approvalRequestId!);
    expect(outcome.status).toBe("executed");
    expect(fetchSpy).not.toHaveBeenCalled();

    const after = await db.toolRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(after).toMatchObject({ mode: "simulation", status: "ready_simulation", devinSessionId: null });
    const payload = fromJson<{ method: string; url: string; headers: Record<string, string>; body: { prompt: string; tags: string[] } }>(after.simulatedPayload, null as never);
    expect(payload.method).toBe("POST");
    expect(payload.url).toMatch(/\/v3\/organizations\/.+\/sessions$/);
    expect(payload.headers.Authorization).toBe("Bearer <DEVIN_API_KEY>");
    expect(payload.body.prompt.split("\n")[0]).toBe(SKILL_LINE);
    expect(payload.body).not.toHaveProperty("playbook_id");
    expect(displayStatus(after, { status: "executed" })).toBe("ready_simulation");
  });

  it("is idempotent: one session per request, however many times it runs", async () => {
    vi.stubEnv("DEVIN_API_KEY", SECRET);
    vi.stubEnv("DEVIN_ORG_ID", "org-test");
    vi.stubEnv("DEVIN_REPO", "acme/keystone");
    vi.stubEnv("DEVIN_MAX_ACU", "10");
    const createSession = vi.fn(async () => ({ id: "devin-abc123", url: "https://app.devin.ai/sessions/abc123", status: "running", pullRequest: null, acus: null }));
    const fake: DevinClient = { createSession, getSession: vi.fn() };
    setDevinClientForTests(fake);

    const req = await submit();
    await approve(admin, req.approvalRequestId!);
    await Promise.allSettled([execute(admin, req.approvalRequestId!), execute(admin, req.approvalRequestId!)]);
    const again = await execute(admin, req.approvalRequestId!);
    expect(again).toMatchObject({ status: "executed", alreadyExecuted: true });
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ repos: ["acme/keystone"], max_acu_limit: 10, tags: ["keystone", "new-tool"], title: "Keystone request: Month-end reconciliation board" }),
    );

    // Even calling the launcher directly reuses the recorded session.
    const reused = await launchForRequest(req.id);
    expect(reused).toMatchObject({ mode: "live", reused: true, session: { id: "devin-abc123" } });
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(await db.toolRequest.findUniqueOrThrow({ where: { id: req.id } })).toMatchObject({ mode: "live", status: "building", devinSessionId: "devin-abc123" });
  });
});

describe("the Devin API key", () => {
  it("never appears in stored data, page data or simulated requests", async () => {
    vi.stubEnv("DEVIN_API_KEY", SECRET);
    vi.stubEnv("DEVIN_ORG_ID", "org-test");
    setDevinClientForTests({ createSession: vi.fn(async () => parseSession({ session_id: "devin-k1", url: "https://app.devin.ai/sessions/k1" })), getSession: vi.fn() });
    const req = await submit();
    await approve(admin, req.approvalRequestId!);
    await execute(admin, req.approvalRequestId!);

    const stored = await db.toolRequest.findUniqueOrThrow({ where: { id: req.id } });
    const approval = await db.approvalRequest.findUniqueOrThrow({ where: { id: req.approvalRequestId! } });
    const audit = await db.auditEvent.findMany({ where: { OR: [{ entityId: req.id }, { entityId: req.approvalRequestId! }] } });
    const view = await getRequest(req.id);
    const sim = simulatedRequest({ orgId: "org-test", baseUrl: "https://api.devin.ai" }, buildSessionBody(stored, { repo: null, maxAcu: null }));
    for (const thing of [stored, approval, audit, view, sim]) expect(JSON.stringify(thing)).not.toContain(SECRET);
  });

  it("is sent only in the Authorization header, and errors don't echo it", async () => {
    const calls: Array<{ url: string; headers: Record<string, string>; body?: string }> = [];
    const client = new HttpDevinClient(
      { apiKey: SECRET, orgId: "org-test", repo: null, maxAcu: null, baseUrl: "https://api.devin.ai" },
      async (url, init) => {
        calls.push({ url, headers: init.headers, body: init.body });
        return { ok: false, status: 500, json: async () => ({}) };
      },
    );
    const err = await client.createSession({ prompt: "x", title: "t", tags: [] }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain(SECRET);
    expect(calls[0].url).toBe("https://api.devin.ai/v3/organizations/org-test/sessions");
    expect(calls[0].headers.Authorization).toBe(`Bearer ${SECRET}`);
    expect(calls[0].body).not.toContain(SECRET);
  });

  it("is only read by the server-side client, and no client component imports it", () => {
    const src = path.resolve(__dirname, "../../..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name !== "__tests__") walk(full);
        } else if (/\.(ts|tsx)$/.test(name)) files.push(full);
      }
    };
    walk(src);
    const readers = files.filter((f) => /env\.DEVIN_API_KEY|env\[["']DEVIN_API_KEY/.test(readFileSync(f, "utf8"))).map((f) => path.relative(src, f));
    expect(readers).toEqual([path.join("platform", "requests", "devin.ts")]);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      if (/^\s*["']use client["']/.test(text)) expect(text, f).not.toMatch(/requests\/devin|NEXT_PUBLIC_DEVIN/);
    }
  });
});

describe("parsing session responses", () => {
  it("reads ids, PRs and ACUs from the likely field names", () => {
    expect(parseSession({ session_id: "devin-1", status_enum: "working", pull_requests: [{ pr_url: "https://github.com/a/b/pull/1", pr_state: "MERGED" }], acus_consumed: 4.5 })).toEqual({
      id: "devin-1",
      url: "https://app.devin.ai/sessions/1",
      status: "working",
      pullRequest: { url: "https://github.com/a/b/pull/1", state: "merged" },
      acus: 4.5,
    });
    expect(parseSession({ devin_id: "x", url: "https://app.devin.ai/sessions/x", pull_request: { url: "https://github.com/a/b/pull/2" } }).pullRequest).toEqual({
      url: "https://github.com/a/b/pull/2",
      state: null,
    });
    expect(parseSession(null)).toEqual({ id: null, url: null, status: null, pullRequest: null, acus: null });
  });
});

describe("status timeline", () => {
  it("walks Submitted, Approved, Devin building, PR open, Merged", () => {
    const states = (s: Parameters<typeof timeline>[0], mode: string | null = "live") => timeline(s, mode).map((t) => t.state);
    expect(states("submitted")).toEqual(["done", "current", "upcoming", "upcoming", "upcoming"]);
    expect(states("rejected")).toEqual(["done", "failed", "upcoming", "upcoming", "upcoming"]);
    expect(states("building")).toEqual(["done", "done", "current", "upcoming", "upcoming"]);
    expect(states("pr_open")).toEqual(["done", "done", "done", "current", "upcoming"]);
    expect(states("merged")).toEqual(["done", "done", "done", "done", "done"]);
    expect(timeline("ready_simulation", "simulation")[2].label).toBe("Ready to launch (simulation)");
  });
});

describe("impact", () => {
  it("matches the seeded requests", async () => {
    await seedToolRequests(db);
    const seeded = await db.toolRequest.findMany({ where: { id: { startsWith: "treq_seed_" } } });
    const approvals = await db.approvalRequest.findMany({ where: { id: { in: seeded.map((r) => r.approvalRequestId!) } } });
    const users = await db.user.findMany({ where: { subject: { startsWith: "demo|" } } });
    expect(seeded).toHaveLength(6);

    const impact = computeImpact({
      requests: seeded.map((r) => ({
        status: r.status,
        prState: r.prState,
        toolSlug: r.toolSlug,
        audienceGroups: fromJson<string[]>(r.audienceGroups, []),
        hoursPerWeek: r.hoursPerWeek,
        acusUsed: r.acusUsed,
        approvalStatus: approvals.find((a) => a.id === r.approvalRequestId)?.status ?? null,
      })),
      users: users.map((u) => ({ id: u.id, groups: fromJson<string[]>(u.groups, []), roles: fromJson(u.roles, []) })),
      readPermissionFor: () => "no-one-has-this:read", // isolate the audience-group rule
      acuPrice: 2,
      seatPrice: 22,
    });

    expect(impact.total).toBe(6);
    expect(impact.shipped).toBe(2);
    expect(impact.byStatus).toMatchObject({ merged: 2, pr_open: 1, ready_simulation: 1, rejected: 1, submitted: 1 });
    expect(impact.hoursSavedPerWeek).toBe(14); // 12 (chargebacks) + 2 (refunds change)
    expect(impact.totalAcus).toBe(18.75); // 9.5 + 3.25 + 6
    expect(impact.acuCost).toBe(37.5);
    expect(impact.shippedTools).toEqual(["chargebacks", "refunds"]);
    // Shipped audiences: ops, finance-approvers, compliance, support -> maria, sam, olivia, dan, priya, chris.
    expect(impact.seatUsers).toBe(6);
    expect(impact.seatCostMonthly).toBe(132);
    expect(impact.seatCostAnnual).toBe(1584);
    expect(impact.formulas.acuCost).toContain("18.75 ACUs × $2");
  });

  it("counts users who can read a shipped tool, and shows the cost hint without a price", () => {
    const impact = computeImpact({
      requests: [{ status: "merged", prState: "merged", toolSlug: "refunds", audienceGroups: [], hoursPerWeek: 1, acusUsed: 2, approvalStatus: "executed" }],
      users: [
        { id: "a", groups: [], roles: ["auditor"] },
        { id: "b", groups: [], roles: ["support_agent"] },
      ],
      readPermissionFor: () => "audit:read",
      acuPrice: null,
      seatPrice: 22,
    });
    expect(impact.seatUsers).toBe(1);
    expect(impact.acuCost).toBeNull();
    expect(impact.formulas.acuCost).toContain("DEVIN_ACU_PRICE");
  });
});
