/**
 * Chargebacks seed data: ~200 card disputes against seeded transactions, in
 * every status, with deadlines spread so the queue has overdue, due-soon and
 * comfortable items. Deterministic (own faker instance and seed).
 *
 * Showcase record: dsp_000001 is a dispute over $500 that olivia (ops) marked
 * lost, with a pending write-off approval that dan or priya (finance) must
 * decide. Fake data only.
 */
import { Faker, en } from "@faker-js/faker";
import type { PrismaClient } from "@prisma/client";
import { DEMO_IDENTITIES } from "../../src/platform/auth/demo-identities";
import { rolesForGroups } from "../../src/platform/auth/group-role-map";

const DAY_MS = 24 * 60 * 60 * 1000;
const WRITE_OFF_ACTION = "chargebacks.write_off";
const THRESHOLD_CENTS = 50_001; // matches the chargebacks manifest
export const DISPUTE_COUNT = 200;
export const SHOWCASE_DISPUTE_ID = "dsp_000001";

const REASONS = ["fraud", "not_received", "not_as_described", "duplicate", "canceled_subscription", "other"] as const;

type Txn = { id: string; customerId: string; amountCents: number; merchant: string; cardLast4: string; status: string; createdAt: Date };
type Customer = { id: string; email: string };

/** Demo users are normally created on first sign-in; seed the ones the data refers to so their IDs line up. */
async function ensureDemoUser(prisma: PrismaClient, username: string) {
  const identity = DEMO_IDENTITIES.find((d) => d.username === username);
  if (!identity) throw new Error(`Unknown demo identity ${username}`);
  const data = {
    email: identity.email,
    name: identity.name,
    groups: JSON.stringify([...identity.groups].sort()),
    roles: JSON.stringify(rolesForGroups(identity.groups)),
  };
  return prisma.user.upsert({ where: { subject: identity.subject }, create: { subject: identity.subject, ...data }, update: data });
}

export async function seedChargebacks(prisma: PrismaClient, anchor: Date, data: { customers: Customer[]; transactions: Txn[] }) {
  const f = new Faker({ locale: [en] });
  f.seed(20261120);

  const olivia = await ensureDemoUser(prisma, "olivia");
  const dan = await ensureDemoUser(prisma, "dan");
  const priya = await ensureDemoUser(prisma, "priya");
  const otherOps = { id: "usr_seed_ops_jordan", name: "Jordan Park" };
  const assignees = [{ id: olivia.id, name: olivia.name }, otherOps];

  const emailByCustomer = new Map(data.customers.map((c) => [c.id, c.email]));
  const candidates = data.transactions.filter((t) => t.status === "settled" && t.amountCents >= 2_000);
  // Large transactions back the disputes whose loss needs finance sign-off.
  const bigPool = f.helpers.shuffle(candidates.filter((t) => t.amountCents >= THRESHOLD_CENTS && t.amountCents <= 300_000));
  const used = new Set<string>();
  const nextFrom = (pool: Txn[]) => {
    const t = pool.find((x) => !used.has(x.id));
    if (!t) throw new Error("Not enough seeded transactions for chargebacks");
    used.add(t.id);
    return t;
  };
  const restPool = f.helpers.shuffle(candidates);

  // Status mix: 55 open, 45 in progress, 50 won, 6 lost (write-off pending), 44 written off.
  const plan: string[] = [
    ...Array(55).fill("open"),
    ...Array(45).fill("in_progress"),
    ...Array(50).fill("won"),
    ...Array(6).fill("lost"),
    ...Array(44).fill("written_off"),
  ];

  const now = anchor.getTime() + 12 * 60 * 60 * 1000; // midday on the anchor date
  const disputes = plan.map((planned, i) => {
    const id = `dsp_${String(i + 1).padStart(6, "0")}`;
    const status = i === 0 ? "lost" : planned;
    const t = status === "lost" ? nextFrom(bigPool) : nextFrom(restPool);
    const active = status === "open" || status === "in_progress";
    // Active disputes: deadlines from 3 days overdue to 25 days out, weighted toward soon.
    const daysToDeadline = active ? f.helpers.weightedArrayElement([
      { weight: 8, value: f.number.int({ min: -3, max: -1 }) },
      { weight: 22, value: f.number.int({ min: 0, max: 2 }) },
      { weight: 30, value: f.number.int({ min: 3, max: 7 }) },
      { weight: 40, value: f.number.int({ min: 8, max: 25 }) },
    ]) : f.number.int({ min: -60, max: -1 });
    const respondBy = new Date(now + daysToDeadline * DAY_MS + f.number.int({ min: 0, max: 8 }) * 60 * 60 * 1000);
    const openedAt = new Date(respondBy.getTime() - 30 * DAY_MS);
    // Resolved within the last 60 days; about a third in the current month.
    const resolvedAt = active ? null : new Date(now - f.number.int({ min: 0, max: 55 }) * DAY_MS - f.number.int({ min: 1, max: 20 }) * 60 * 60 * 1000);
    const assignee = status === "open" ? null : i === 0 ? assignees[0] : f.helpers.arrayElement(assignees);
    const amountCents = t.amountCents;
    const hasEvidence = !active || (status === "in_progress" && f.datatype.boolean({ probability: 0.6 }));
    return {
      id,
      transactionId: t.id,
      customerId: t.customerId,
      customerEmail: emailByCustomer.get(t.customerId) ?? "unknown@example.com",
      amountCents,
      currency: "USD",
      merchant: t.merchant,
      cardLast4: t.cardLast4,
      network: f.helpers.arrayElement(["visa", "mastercard"]),
      reasonCode: i === 0 ? "not_received" : f.helpers.arrayElement(REASONS),
      status,
      assignedToId: assignee?.id ?? null,
      assignedToName: assignee?.name ?? null,
      assignedAt: assignee ? new Date(openedAt.getTime() + DAY_MS) : null,
      evidenceNote:
        i === 0
          ? "Sent carrier tracking (delivered and signed for on Oct 14), the order confirmation email, and the customer's chat transcript confirming the address."
          : hasEvidence
            ? f.helpers.arrayElement([
                "Sent delivery confirmation and signed proof of delivery.",
                "Sent receipt, IP and device match from the original purchase, and prior undisputed orders.",
                "Sent cancellation policy and the customer's acceptance at checkout.",
                "Sent screenshots of the product listing and the support thread.",
              ])
            : null,
      evidenceAt: hasEvidence || i === 0 ? new Date(openedAt.getTime() + 2 * DAY_MS) : null,
      openedAt,
      respondBy,
      resolvedAt,
      writtenOffAt: status === "written_off" ? resolvedAt : null,
    };
  });

  await prisma.$transaction(
    async (tx) => {
      await tx.approvalRequest.deleteMany({ where: { tool: "chargebacks" } });
      await tx.dispute.deleteMany();
      await tx.dispute.createMany({ data: disputes });

      // Approvals: pending write-offs for "lost" disputes (requested by the assignee),
      // and executed ones for large past write-offs (approved by finance).
      for (const d of disputes) {
        const pending = d.status === "lost";
        const pastLarge = d.status === "written_off" && d.amountCents >= THRESHOLD_CENTS;
        if (!pending && !pastLarge) continue;
        const requester = d.id === SHOWCASE_DISPUTE_ID ? { id: olivia.id, name: olivia.name } : { id: d.assignedToId!, name: d.assignedToName! };
        const decider = f.helpers.arrayElement([dan, priya]);
        const approval = await tx.approvalRequest.create({
          data: {
            tool: "chargebacks",
            actionType: WRITE_OFF_ACTION,
            entityType: "Dispute",
            entityId: d.id,
            payload: JSON.stringify({ disputeId: d.id }),
            amountCents: d.amountCents,
            status: pending ? "pending" : "executed",
            requestedById: requester.id,
            requestedByName: requester.name,
            decidedById: pending ? null : decider.id,
            decidedByName: pending ? null : decider.name,
            decidedAt: pending ? null : d.resolvedAt,
            reason: `Lost dispute ${d.id} (${d.merchant}). Write-off needs finance sign-off.`,
            approvePermission: "chargebacks:approve",
            idempotencyKey: `${WRITE_OFF_ACTION}:${d.id}`,
            attempts: pending ? 0 : 1,
            result: pending ? null : JSON.stringify({ writtenOff: true }),
            executedAt: pending ? null : d.resolvedAt,
            createdAt: d.resolvedAt ?? new Date(now),
          },
        });

        // History for disputes with approvals, so their timelines tell the story.
        const actor = (u: { id: string; name: string }, roles: string[]) => ({ actorId: u.id, actorName: u.name, actorRoles: JSON.stringify(roles) });
        const events = [
          { at: d.assignedAt!, who: actor(requester, ["ops_analyst"]), action: "chargebacks.dispute.pick_up", before: { status: "open", assignedToName: null }, after: { status: "in_progress", assignedToName: requester.name } },
          { at: d.evidenceAt ?? d.assignedAt!, who: actor(requester, ["ops_analyst"]), action: "chargebacks.dispute.save_evidence", before: { evidenceNote: null }, after: { evidenceNote: d.evidenceNote } },
          { at: d.resolvedAt!, who: actor(requester, ["ops_analyst"]), action: "chargebacks.dispute.mark_lost", before: { status: "in_progress" }, after: { status: "lost" }, requestId: approval.id },
          ...(pending
            ? []
            : [{ at: d.resolvedAt!, who: actor({ id: decider.id, name: decider.name }, ["finance_approver"]), action: "chargebacks.dispute.write_off", before: { status: "lost" }, after: { status: "written_off" }, requestId: approval.id }]),
        ];
        await tx.auditEvent.createMany({
          data: events.map((e) => ({
            ...e.who,
            createdAt: e.at,
            tool: "chargebacks",
            action: e.action,
            entityType: "Dispute",
            entityId: d.id,
            before: JSON.stringify(e.before),
            after: JSON.stringify(e.after),
            requestId: "requestId" in e ? (e.requestId ?? null) : null,
          })),
        });
      }
    },
    { timeout: 60_000 },
  );

  return { disputes: disputes.length };
}
