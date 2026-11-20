/**
 * Governance demo data: provisions the demo identities as users (as if they
 * had signed in) and creates two access reviews: last quarter's, completed,
 * and this quarter's, in progress. Audit events are written for every step so
 * the audit log and evidence pack have history. Fake people only.
 */
import type { PrismaClient } from "@prisma/client";
import { DEMO_IDENTITIES, UNPROVISIONED_DEMO_IDENTITY } from "../src/platform/auth/demo-identities";
import { rolesForGroups } from "../src/platform/auth/group-role-map";

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_DAYS = 30;

/** Days since each identity last signed in. sam and contractor are stale on purpose. */
const LAST_SIGN_IN_DAYS_AGO: Record<string, number> = {
  maria: 1, sam: 41, olivia: 2, dan: 0, priya: 3, chris: 0, alex: 5, admin: 0, contractor: 63,
};

const quarterName = (d: Date) => `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()} access review`;

export async function seedGovernance(prisma: PrismaClient, anchor: Date) {
  const identities = [...DEMO_IDENTITIES, UNPROVISIONED_DEMO_IDENTITY];
  const users = [];
  for (const id of identities) {
    const groups = [...id.groups].sort();
    const data = {
      email: id.email,
      name: id.name,
      groups: JSON.stringify(groups),
      roles: JSON.stringify(rolesForGroups(groups)),
      lastLoginAt: new Date(anchor.getTime() - (LAST_SIGN_IN_DAYS_AGO[id.username] ?? 0) * DAY_MS + 9 * 60 * 60 * 1000),
    };
    users.push({
      username: id.username,
      user: await prisma.user.upsert({ where: { subject: id.subject }, create: { subject: id.subject, ...data }, update: data }),
    });
  }
  if ((await prisma.accessReview.count()) > 0) return;

  const byName = Object.fromEntries(users.map((u) => [u.username, u.user]));
  const admin = byName.admin;
  const chris = byName.chris;
  const actor = (u: typeof admin) => ({ actorId: u.id, actorName: u.name, actorRoles: u.roles });
  const audit = (u: typeof admin, at: Date, action: string, entityType: string, entityId: string, before: unknown, after: unknown) =>
    prisma.auditEvent.create({
      data: { ...actor(u), createdAt: at, tool: "platform", action, entityType, entityId, before: before ? JSON.stringify(before) : null, after: JSON.stringify(after) },
    });

  // Each review sees sign-in times as they were when it started.
  const snapshot = (startedAt: Date) =>
    users.map(({ username, user }) => {
      const daysAgo = LAST_SIGN_IN_DAYS_AGO[username] ?? 0;
      return {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        groups: user.groups,
        roles: user.roles,
        lastLoginAt: new Date(startedAt.getTime() - daysAgo * DAY_MS - 2 * 60 * 60 * 1000),
        stale: daysAgo >= STALE_DAYS,
      };
    });

  // Last quarter: completed. Everyone kept except the contractor.
  const lastStart = new Date(anchor.getTime() - 75 * DAY_MS + 10 * 60 * 60 * 1000);
  const prevQuarter = new Date(anchor.getTime() - 92 * DAY_MS);
  const last = await prisma.accessReview.create({
    data: { name: quarterName(prevQuarter), startedById: admin.id, startedByName: admin.name, startedAt: lastStart },
  });
  await audit(admin, lastStart, "access_review.start", "AccessReview", last.id, null, { name: last.name, status: "in_progress", users: users.length });
  let t = lastStart.getTime();
  for (const row of snapshot(lastStart)) {
    const reviewer = row.userId === chris.id ? admin : chris;
    const revoke = row.userId === byName.contractor.id;
    const decidedAt = new Date((t += 40 * 60 * 1000));
    const item = await prisma.accessReviewItem.create({
      data: {
        ...row,
        reviewId: last.id,
        decision: revoke ? "revoke" : "keep",
        note: revoke ? "Contract ended in August. Remove from the contractors group." : null,
        decidedById: reviewer.id,
        decidedByName: reviewer.name,
        decidedAt,
      },
    });
    await audit(reviewer, decidedAt, "access_review.decide", "AccessReviewItem", item.id,
      { reviewId: last.id, user: row.userName, decision: null, note: null },
      { reviewId: last.id, user: row.userName, decision: item.decision, note: item.note });
  }
  const lastDone = new Date(t + 30 * 60 * 1000);
  await prisma.accessReview.update({
    where: { id: last.id },
    data: { status: "completed", completedById: chris.id, completedByName: chris.name, completedAt: lastDone },
  });
  await audit(chris, lastDone, "access_review.complete", "AccessReview", last.id, { status: "in_progress" }, { status: "completed", keep: users.length - 1, revoke: 1 });

  // This quarter: in progress, about half decided, stale accounts still open.
  const curStart = new Date(anchor.getTime() - 2 * DAY_MS + 9 * 60 * 60 * 1000);
  const cur = await prisma.accessReview.create({
    data: { name: quarterName(anchor), startedById: admin.id, startedByName: admin.name, startedAt: curStart },
  });
  await audit(admin, curStart, "access_review.start", "AccessReview", cur.id, null, { name: cur.name, status: "in_progress", users: users.length });
  const decided = new Set(["maria", "olivia", "dan", "priya"]);
  t = curStart.getTime();
  for (const { username } of users) {
    const row = snapshot(curStart).find((r) => r.userId === byName[username].id)!;
    const keep = decided.has(username);
    const decidedAt = keep ? new Date((t += 25 * 60 * 1000)) : null;
    const item = await prisma.accessReviewItem.create({
      data: { ...row, reviewId: cur.id, decision: keep ? "keep" : null, decidedById: keep ? chris.id : null, decidedByName: keep ? chris.name : null, decidedAt },
    });
    if (keep && decidedAt) {
      await audit(chris, decidedAt, "access_review.decide", "AccessReviewItem", item.id,
        { reviewId: cur.id, user: row.userName, decision: null, note: null },
        { reviewId: cur.id, user: row.userName, decision: "keep", note: null });
    }
  }
  console.log(`Seeded ${users.length} users and 2 access reviews.`);
}
