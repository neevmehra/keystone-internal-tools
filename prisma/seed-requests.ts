/**
 * Seed: six historical "Build with Devin" requests in mixed statuses (two
 * shipped, with hours and ACUs), so /build/impact and the request pages
 * have data. Also upserts the demo users they reference. Fake data only.
 * Skips itself if already seeded.
 */
import type { PrismaClient } from "@prisma/client";
import { DEMO_IDENTITIES } from "../src/platform/auth/demo-identities";
import { rolesForGroups } from "../src/platform/auth/group-role-map";
import { buildSessionBody, getDevinConfig, simulatedRequest } from "../src/platform/requests/devin";
import { buildDevinPrompt, type RequestDraft } from "../src/platform/requests/prompt";

const DAY = 24 * 60 * 60 * 1000;
const LAUNCH_ACTION = "build.launch_devin_session";

type Seed = RequestDraft & {
  id: string;
  by: string;
  createdDaysAgo: number;
  approval: "pending" | "rejected" | "executed";
  decidedDaysAgo?: number;
  rejectReason?: string;
  mode?: "live" | "simulation";
  status: string;
  prUrl?: string;
  prState?: "open" | "merged";
  acusUsed?: number;
  shippedDaysAgo?: number;
};

const SEEDS: Seed[] = [
  {
    id: "treq_seed_01",
    by: "olivia",
    kind: "new_tool",
    title: "Chargebacks tracker",
    toolSlug: "chargebacks",
    problem: "We track card disputes in a shared spreadsheet. Two people work the same dispute, we miss response deadlines, and nobody knows what we've lost this month.",
    audienceGroups: ["ops", "finance-approvers", "compliance"],
    workflow: "See open disputes sorted by deadline, pick one up, add an evidence note, mark it won or lost.",
    signOff: "Finance signs off on write-offs",
    signOffAboveCents: 50_000,
    involvesPii: true,
    movesMoney: true,
    peopleCount: 4,
    hoursPerWeek: 12,
    createdDaysAgo: 23,
    approval: "executed",
    decidedDaysAgo: 23,
    mode: "live",
    status: "merged",
    prUrl: "https://github.com/example-org/keystone/pull/14",
    prState: "merged",
    acusUsed: 9.5,
    shippedDaysAgo: 20,
  },
  {
    id: "treq_seed_02",
    by: "maria",
    kind: "change_tool",
    title: "Refunds: flag repeat refund requests",
    toolSlug: "refunds",
    toolName: "Refunds",
    problem: "Some customers ask for refunds on several transactions in a week. We'd like to see that on the request form before we submit.",
    audienceGroups: ["support", "finance-approvers"],
    workflow: "When requesting a refund, show how many refunds this customer has had in the last 30 days.",
    involvesPii: true,
    movesMoney: false,
    peopleCount: 6,
    hoursPerWeek: 2,
    createdDaysAgo: 11,
    approval: "executed",
    decidedDaysAgo: 11,
    mode: "live",
    status: "merged",
    prUrl: "https://github.com/example-org/keystone/pull/21",
    prState: "merged",
    acusUsed: 3.25,
    shippedDaysAgo: 9,
  },
  {
    id: "treq_seed_03",
    by: "chris",
    kind: "new_tool",
    title: "Vendor due diligence tracker",
    toolSlug: "vendor-diligence",
    problem: "Vendor security reviews live in email threads. Auditors ask for evidence and we spend days finding it.",
    audienceGroups: ["compliance", "auditors"],
    workflow: "List vendors, record each review with its documents and expiry date, and flag reviews expiring in 30 days.",
    signOff: "Compliance lead approves high-risk vendors",
    involvesPii: false,
    movesMoney: false,
    peopleCount: 2,
    hoursPerWeek: 5,
    createdDaysAgo: 3,
    approval: "executed",
    decidedDaysAgo: 3,
    mode: "live",
    status: "pr_open",
    prUrl: "https://github.com/example-org/keystone/pull/27",
    prState: "open",
    acusUsed: 6,
  },
  {
    id: "treq_seed_04",
    by: "priya",
    kind: "change_tool",
    title: "Refunds: weekly summary for finance",
    toolSlug: "refunds",
    toolName: "Refunds",
    problem: "Finance rebuilds a weekly refunds summary by hand every Monday.",
    audienceGroups: ["finance-approvers"],
    workflow: "A summary view: refunds by reason and status for the last 7 days, with totals.",
    involvesPii: false,
    movesMoney: false,
    peopleCount: 2,
    hoursPerWeek: 1.5,
    createdDaysAgo: 1,
    approval: "executed",
    decidedDaysAgo: 1,
    mode: "simulation",
    status: "ready_simulation",
  },
  {
    id: "treq_seed_05",
    by: "sam",
    kind: "new_tool",
    title: "Team lunch orders",
    problem: "Ordering lunch for the support team on Fridays takes a lot of back and forth.",
    audienceGroups: ["support"],
    workflow: "Everyone picks from a menu by Thursday, someone places the order.",
    involvesPii: false,
    movesMoney: false,
    peopleCount: 12,
    hoursPerWeek: 0.5,
    createdDaysAgo: 6,
    approval: "rejected",
    decidedDaysAgo: 5,
    rejectReason: "Not a Keystone tool: use the existing catering form.",
    status: "submitted",
  },
  {
    id: "treq_seed_06",
    by: "priya",
    kind: "new_tool",
    title: "Month-end reconciliation board",
    problem: "Month-end close means matching processor payouts to the ledger in a spreadsheet, and breaks get lost.",
    audienceGroups: ["finance-approvers", "ops"],
    workflow: "Show each payout with its matched ledger entries, list breaks, assign each break to someone, and mark it resolved with a note.",
    signOff: "Finance approves write-offs of unresolved breaks",
    signOffAboveCents: 100_000,
    involvesPii: false,
    movesMoney: true,
    peopleCount: 3,
    hoursPerWeek: 8,
    createdDaysAgo: 0,
    approval: "pending",
    status: "submitted",
  },
];

export async function seedToolRequests(prisma: PrismaClient, anchor = new Date()) {
  if (await prisma.toolRequest.findUnique({ where: { id: SEEDS[0].id } })) return 0;

  const users = new Map<string, { id: string; name: string; groups: string[]; roles: string[] }>();
  for (const d of DEMO_IDENTITIES) {
    const groups = [...d.groups].sort();
    const roles = rolesForGroups(groups);
    const u = await prisma.user.upsert({
      where: { subject: d.subject },
      create: { subject: d.subject, email: d.email, name: d.name, groups: JSON.stringify(groups), roles: JSON.stringify(roles) },
      update: {},
    });
    users.set(d.username, { id: u.id, name: u.name, groups, roles });
  }
  const admin = users.get("admin")!;
  const ago = (days: number, minutes = 0) => new Date(anchor.getTime() - days * DAY - minutes * 60_000);
  const cfg = getDevinConfig({});

  for (const s of SEEDS) {
    const by = users.get(s.by)!;
    const prompt = buildDevinPrompt(s, { name: by.name, groups: by.groups });
    const createdAt = ago(s.createdDaysAgo, 120);
    const decidedAt = s.decidedDaysAgo != null ? ago(s.decidedDaysAgo, 60) : null;
    const approvalId = `apr_${s.id}`;
    const simulated = s.mode === "simulation" ? simulatedRequest(cfg, buildSessionBody({ prompt, title: s.title, toolSlug: s.toolSlug ?? null }, cfg)) : null;

    await prisma.approvalRequest.create({
      data: {
        id: approvalId,
        tool: "build",
        actionType: LAUNCH_ACTION,
        entityType: "ToolRequest",
        entityId: s.id,
        payload: JSON.stringify({ toolRequestId: s.id }),
        status: s.approval,
        requestedById: by.id,
        requestedByName: by.name,
        decidedById: s.approval === "pending" ? null : admin.id,
        decidedByName: s.approval === "pending" ? null : admin.name,
        decidedAt,
        reason: s.rejectReason ?? null,
        approvePermission: "requests:approve",
        idempotencyKey: `toolreq_${s.id}`,
        attempts: s.approval === "executed" ? 1 : 0,
        result: s.approval === "executed" ? JSON.stringify({ mode: s.mode }) : null,
        executedAt: s.approval === "executed" ? decidedAt : null,
        createdAt,
      },
    });

    await prisma.toolRequest.create({
      data: {
        id: s.id,
        kind: s.kind,
        toolSlug: s.toolSlug ?? null,
        title: s.title,
        problem: s.problem,
        audienceGroups: JSON.stringify(s.audienceGroups),
        workflow: s.workflow,
        signOff: s.signOff ?? null,
        signOffAboveCents: s.signOffAboveCents ?? null,
        involvesPii: s.involvesPii,
        movesMoney: s.movesMoney,
        peopleCount: s.peopleCount ?? null,
        hoursPerWeek: s.hoursPerWeek ?? null,
        prompt,
        status: s.status,
        mode: s.mode ?? null,
        requestedById: by.id,
        requestedByName: by.name,
        approvalRequestId: approvalId,
        devinStatus: s.mode === "live" ? (s.prState === "merged" ? "finished" : "working") : null,
        simulatedPayload: simulated ? JSON.stringify(simulated) : null,
        prUrl: s.prUrl ?? null,
        prState: s.prState ?? null,
        acusUsed: s.acusUsed ?? null,
        launchedAt: s.mode ? decidedAt : null,
        shippedAt: s.shippedDaysAgo != null ? ago(s.shippedDaysAgo) : null,
        createdAt,
      },
    });

    // History: the same audit events the app writes for these steps.
    const events: Array<{ at: Date; actor: typeof by; action: string; entityType: string; entityId: string; after: unknown }> = [
      { at: createdAt, actor: by, action: "build.request.submit", entityType: "ToolRequest", entityId: s.id, after: { kind: s.kind, title: s.title, status: "submitted" } },
      { at: createdAt, actor: by, action: "approval.request", entityType: "ApprovalRequest", entityId: approvalId, after: { status: "pending" } },
    ];
    if (decidedAt && s.approval === "rejected") {
      events.push({ at: decidedAt, actor: admin, action: "approval.reject", entityType: "ApprovalRequest", entityId: approvalId, after: { status: "rejected", reason: s.rejectReason } });
    }
    if (decidedAt && s.approval === "executed") {
      events.push({ at: decidedAt, actor: admin, action: "approval.approve", entityType: "ApprovalRequest", entityId: approvalId, after: { status: "approved" } });
      events.push({ at: new Date(decidedAt.getTime() + 1000), actor: admin, action: "approval.execute", entityType: "ApprovalRequest", entityId: approvalId, after: { status: "executed" } });
    }
    if (s.prState === "merged" && s.shippedDaysAgo != null) {
      events.push({ at: ago(s.shippedDaysAgo), actor: admin, action: "build.request.link_pr", entityType: "ToolRequest", entityId: s.id, after: { prUrl: s.prUrl, prState: "merged", status: "merged" } });
    }
    for (const e of events) {
      await prisma.auditEvent.create({
        data: {
          createdAt: e.at,
          actorId: e.actor.id,
          actorName: e.actor.name,
          actorRoles: JSON.stringify(e.actor.roles),
          tool: "build",
          action: e.action,
          entityType: e.entityType,
          entityId: e.entityId,
          before: null,
          after: JSON.stringify(e.after),
          requestId: approvalId,
        },
      });
    }
  }
  return SEEDS.length;
}
