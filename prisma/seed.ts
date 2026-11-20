/**
 * Deterministic fake data: 1,000 customers and 5,000 card transactions over
 * the last 90 days. Same seed, same rows, so screenshots are repeatable.
 * Dates are offsets from SEED_ANCHOR_DATE (default: today, UTC midnight).
 * Never use real customer data here.
 */
import { faker } from "@faker-js/faker";
import { PrismaClient, type Prisma } from "@prisma/client";
import { DEMO_IDENTITIES } from "../src/platform/auth/demo-identities";
import { rolesForGroups } from "../src/platform/auth/group-role-map";
import { seedRefunds } from "./seeds/refunds";
import { seedGovernance } from "./seed-governance";

export const CUSTOMER_COUNT = 1_000;
export const TRANSACTION_COUNT = 5_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const MERCHANTS: Array<[string, string]> = [
  ["Bluebird Coffee", "Food & drink"],
  ["Northwind Grocers", "Groceries"],
  ["Metro Transit", "Transport"],
  ["Skyline Air", "Travel"],
  ["Harbor Hotels", "Travel"],
  ["Pixel Electronics", "Electronics"],
  ["Evergreen Pharmacy", "Health"],
  ["Cinema Nova", "Entertainment"],
  ["Fjord Streaming", "Subscriptions"],
  ["Atlas Fuel", "Fuel"],
  ["Lumen Utilities", "Utilities"],
  ["Copperleaf Books", "Shopping"],
];

function anchorDate(): Date {
  const raw = process.env.SEED_ANCHOR_DATE;
  const d = raw ? new Date(raw) : new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function buildSeedData(anchor = anchorDate()) {
  faker.seed(20261119);
  const customers = Array.from({ length: CUSTOMER_COUNT }, (_, i) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    return {
      id: `cus_${String(i + 1).padStart(5, "0")}`,
      name: `${firstName} ${lastName}`,
      email: faker.internet
        .email({ firstName, lastName, provider: "example.com" })
        .toLowerCase(),
      phone: `+1-555-${faker.string.numeric(3)}-${faker.string.numeric(4)}`,
      country: faker.helpers.weightedArrayElement([
        { weight: 70, value: "US" },
        { weight: 10, value: "CA" },
        { weight: 10, value: "GB" },
        { weight: 10, value: "DE" },
      ]),
      status: faker.helpers.weightedArrayElement([
        { weight: 92, value: "active" },
        { weight: 5, value: "restricted" },
        { weight: 3, value: "closed" },
      ]),
      riskTier: faker.helpers.weightedArrayElement([
        { weight: 75, value: "low" },
        { weight: 20, value: "medium" },
        { weight: 5, value: "high" },
      ]),
      createdAt: new Date(anchor.getTime() - faker.number.int({ min: 91, max: 900 }) * DAY_MS),
    };
  });

  const transactions = Array.from({ length: TRANSACTION_COUNT }, (_, i) => {
    const [merchant, category] = faker.helpers.arrayElement(MERCHANTS);
    const status = faker.helpers.weightedArrayElement([
      { weight: 85, value: "settled" },
      { weight: 8, value: "pending" },
      { weight: 4, value: "declined" },
      { weight: 3, value: "refunded" },
    ]);
    const amountCents = faker.number.int({ min: 199, max: 250_000 });
    return {
      id: `txn_${String(i + 1).padStart(6, "0")}`,
      customerId: faker.helpers.arrayElement(customers).id,
      amountCents,
      refundedCents: status === "refunded" ? amountCents : 0,
      currency: "USD",
      merchant,
      category,
      cardLast4: faker.string.numeric(4),
      status,
      createdAt: new Date(anchor.getTime() - faker.number.int({ min: 0, max: 90 * DAY_MS - 1 })),
    };
  });

  return { customers, transactions };
}

/**
 * Demo users, so seeded records can name a requester and approver. Sign-in
 * upserts by subject, so these rows (and their IDs) are reused when the demo
 * identities sign in, and roles are recomputed from groups then.
 */
async function seedDemoUsers(tx: Prisma.TransactionClient) {
  const users: Record<string, { id: string; name: string; roles: string[] }> = {};
  for (const d of DEMO_IDENTITIES) {
    const groups = [...d.groups].sort();
    const roles = rolesForGroups(groups);
    const user = await tx.user.upsert({
      where: { subject: d.subject },
      create: { subject: d.subject, email: d.email, name: d.name, groups: JSON.stringify(groups), roles: JSON.stringify(roles) },
      update: {},
    });
    users[d.username] = { id: user.id, name: user.name, roles };
  }
  return users;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * DEMO DATA, NOT A TOOL. A few approvals under tool "demo" so the approvals
 * inbox, notifications and /insights have something to show before real tools
 * (Refunds, Chargebacks) seed their own. Delete this function, its call in
 * main(), and the "demo:approve" permission once they do.
 */
async function seedDemoApprovals(prisma: PrismaClient) {
  if ((await prisma.approvalRequest.count({ where: { tool: "demo" } })) > 0) return 0;

  // Demo users exist before first sign-in so requests can name them. Sign-in
  // upserts the same subject, so IDs stay stable.
  const ids: Record<string, { id: string; name: string; roles: string[] }> = {};
  for (const d of DEMO_IDENTITIES) {
    const roles = rolesForGroups(d.groups);
    const user = await prisma.user.upsert({
      where: { subject: d.subject },
      create: { subject: d.subject, email: d.email, name: d.name, groups: JSON.stringify([...d.groups].sort()), roles: JSON.stringify(roles) },
      update: {},
    });
    ids[d.username] = { id: user.id, name: user.name, roles };
  }

  const now = Date.now();
  type Demo = {
    by: string;
    actionType: string;
    entityType: string;
    entityId: string;
    amountCents: number;
    ageHours: number;
    decision?: { by: string; status: "approved" | "rejected"; afterHours: number; reason: string };
  };
  const demos: Demo[] = [
    { by: "sam", actionType: "demo.vendor_payment", entityType: "VendorPayment", entityId: "vp_1042", amountCents: 485_000, ageHours: 2 },
    { by: "olivia", actionType: "demo.credit_limit_increase", entityType: "Customer", entityId: "cus_00042", amountCents: 1_500_000, ageHours: 9 },
    { by: "priya", actionType: "demo.vendor_payment", entityType: "VendorPayment", entityId: "vp_1043", amountCents: 120_000, ageHours: 30 },
    { by: "maria", actionType: "demo.fee_waiver", entityType: "Customer", entityId: "cus_00117", amountCents: 3_500, ageHours: 96 },
    {
      by: "sam", actionType: "demo.vendor_payment", entityType: "VendorPayment", entityId: "vp_1031", amountCents: 92_000, ageHours: 72,
      decision: { by: "dan", status: "approved", afterHours: 3, reason: "Matches the signed contract." },
    },
    {
      by: "olivia", actionType: "demo.credit_limit_increase", entityType: "Customer", entityId: "cus_00311", amountCents: 800_000, ageHours: 144,
      decision: { by: "priya", status: "rejected", afterHours: 20, reason: "Missing the customer's income statement." },
    },
    {
      by: "maria", actionType: "demo.fee_waiver", entityType: "Customer", entityId: "cus_00090", amountCents: 2_500, ageHours: 48,
      decision: { by: "priya", status: "approved", afterHours: 0.7, reason: "First late fee in two years." },
    },
  ];

  let n = 0;
  for (const d of demos) {
    n++;
    const requester = ids[d.by];
    const createdAt = new Date(now - d.ageHours * HOUR_MS);
    const decider = d.decision ? ids[d.decision.by] : null;
    const decidedAt = d.decision ? new Date(createdAt.getTime() + d.decision.afterHours * HOUR_MS) : null;
    const req = await prisma.approvalRequest.create({
      data: {
        tool: "demo",
        actionType: d.actionType,
        entityType: d.entityType,
        entityId: d.entityId,
        payload: JSON.stringify({ demo: true }),
        amountCents: d.amountCents,
        status: d.decision?.status ?? "pending",
        requestedById: requester.id,
        requestedByName: requester.name,
        decidedById: decider?.id ?? null,
        decidedByName: decider?.name ?? null,
        decidedAt,
        reason: d.decision?.reason ?? null,
        approvePermission: "demo:approve",
        idempotencyKey: `demo_seed_${n}`,
        createdAt,
      },
    });
    const event = (actor: { id: string; name: string; roles: string[] }, action: string, at: Date, after: object) => ({
      actorId: actor.id,
      actorName: actor.name,
      actorRoles: JSON.stringify(actor.roles),
      tool: "demo",
      action,
      entityType: "ApprovalRequest",
      entityId: req.id,
      before: null,
      after: JSON.stringify(after),
      requestId: req.id,
      createdAt: at,
    });
    // The notifications the approvals engine would have sent.
    const deciders = ["dan", "priya"].filter((u) => u !== d.by).map((u) => ids[u].id);
    const label = `${d.actionType.split(".").pop()!.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())} · $${(d.amountCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    await prisma.notification.createMany({
      data: d.decision
        ? [{ channel: "in_app", userId: requester.id, kind: "approval.decided", title: `${d.decision.status === "approved" ? "Approved" : "Rejected"}: ${label}`, body: `${decider?.name} ${d.decision.status} your request: "${d.decision.reason}"`, href: "/approvals?tab=mine", createdAt: decidedAt ?? createdAt }]
        : deciders.map((userId) => ({ channel: "in_app", userId, kind: "approval.requested", title: `Approval needed: ${label}`, body: `${requester.name} requested ${d.actionType.replace(/[._]/g, " ")} in Demo.`, href: "/approvals", createdAt })),
    });
    await prisma.auditEvent.createMany({
      data: [
        event(requester, "approval.request", createdAt, { status: "pending" }),
        ...(d.decision && decider && decidedAt
          ? [event(decider, d.decision.status === "approved" ? "approval.approve" : "approval.reject", decidedAt, { status: d.decision.status, reason: d.decision.reason })]
          : []),
      ],
    });
  }
  return demos.length;
}

async function main() {
  const prisma = new PrismaClient();
  const { customers, transactions } = buildSeedData();
  await prisma.$transaction(async (tx) => {
    await tx.cardTransaction.deleteMany();
    await tx.customer.deleteMany();
    for (let i = 0; i < customers.length; i += 500) {
      await tx.customer.createMany({ data: customers.slice(i, i + 500) });
    }
    for (let i = 0; i < transactions.length; i += 500) {
      await tx.cardTransaction.createMany({ data: transactions.slice(i, i + 500) });
    }
  }, { timeout: 60_000 });
  console.log(`Seeded ${customers.length} customers and ${transactions.length} transactions.`);

  const users = await prisma.$transaction((tx) => seedDemoUsers(tx));
  const refunds = await prisma.$transaction((tx) => seedRefunds(tx, { transactions, users, anchor: anchorDate() }), { timeout: 60_000 });
  console.log(`Seeded ${Object.keys(users).length} demo users and ${refunds} refunds.`);
  const demoApprovals = await seedDemoApprovals(prisma);
  if (demoApprovals) console.log(`Seeded ${demoApprovals} demo approvals (tool "demo").`);
  await seedGovernance(prisma, anchorDate());
  await prisma.$disconnect();
}

if (process.argv[1]?.endsWith("seed.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
