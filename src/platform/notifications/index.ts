/**
 * Notifications. Tools never call Slack or email directly: they (or the
 * platform on their behalf) call notify().
 *
 * - In-app: one row per recipient, written with the caller's transaction, so
 *   a rolled-back action leaves no notification behind.
 * - Slack (only when SLACK_WEBHOOK_URL is set): one row per event, delivered
 *   by deliverPendingNotifications() after the transaction commits. Delivery
 *   never throws, so a Slack failure can't fail or roll back the action.
 */
import { db, type Tx } from "@/platform/db";
import { fromJson } from "@/platform/json";
import { hasPermission } from "@/platform/rbac";
import { permissionsForRoles, type Role } from "@/platform/rbac/permissions";

export const NOTIFICATION_KINDS = ["approval.requested", "approval.decided", "approval.failed"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotifyInput = {
  kind: NotificationKind;
  /** In-app recipients (user IDs). Duplicates and empty IDs are ignored. */
  userIds: readonly string[];
  title: string;
  body?: string;
  /** App-relative link to the record, e.g. "/approvals". */
  href?: string;
};

const SLACK_TIMEOUT_MS = 3_000;

export function slackWebhookUrl(): string | null {
  const url = process.env.SLACK_WEBHOOK_URL?.trim();
  return url ? url : null;
}

function appBaseUrl() {
  return (process.env.AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Record notifications inside the caller's transaction. Returns the number of
 * in-app notifications created.
 */
export async function notify(tx: Tx, input: NotifyInput): Promise<number> {
  const userIds = [...new Set(input.userIds.filter(Boolean))];
  const base = { kind: input.kind, title: input.title, body: input.body ?? null, href: input.href ?? null };
  if (userIds.length) {
    await tx.notification.createMany({ data: userIds.map((userId) => ({ ...base, channel: "in_app", userId })) });
  }
  if (slackWebhookUrl()) {
    await tx.notification.create({ data: { ...base, channel: "slack", userId: null, deliveryStatus: "pending" } });
  }
  return userIds.length;
}

/**
 * notify() guarded by a savepoint: if recording the notification fails, only
 * the notification is rolled back and the caller's action still commits.
 */
export async function safeNotify(tx: Tx, input: NotifyInput | ((tx: Tx) => Promise<NotifyInput>)): Promise<number> {
  await tx.$executeRawUnsafe("SAVEPOINT keystone_notify");
  try {
    const n = await notify(tx, typeof input === "function" ? await input(tx) : input);
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT keystone_notify");
    return n;
  } catch (err) {
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT keystone_notify").catch(() => {});
    console.error("[keystone] notify failed, action continues:", err instanceof Error ? err.message : "unknown error");
    return 0;
  }
}

/** Users who hold a permission (roles are stored on the user at sign-in). */
export async function userIdsWithPermission(tx: Tx, permission: string, excludeUserIds: readonly string[] = []): Promise<string[]> {
  const users = await tx.user.findMany({ select: { id: true, roles: true } });
  return users
    .filter((u) => !excludeUserIds.includes(u.id))
    .filter((u) => hasPermission({ permissions: permissionsForRoles(fromJson<Role[]>(u.roles, [])) }, permission))
    .map((u) => u.id);
}

export function slackText(n: { title: string; body: string | null; href: string | null }) {
  const lines = [`*${n.title}*`];
  if (n.body) lines.push(n.body);
  if (n.href) lines.push(`<${appBaseUrl()}${n.href}|Open in Keystone>`);
  return lines.join("\n");
}

/**
 * Deliver pending Slack notifications. Call after a transaction commits.
 * Never throws: failures are stored on the row (deliveryStatus "failed").
 */
export async function deliverPendingNotifications(): Promise<{ sent: number; failed: number }> {
  const result = { sent: 0, failed: 0 };
  const url = slackWebhookUrl();
  if (!url) return result;
  try {
    const pending = await db.notification.findMany({
      where: { channel: "slack", deliveryStatus: "pending" },
      orderBy: { createdAt: "asc" },
      take: 25,
    });
    for (const n of pending) {
      // Claim the row so a concurrent delivery can't send it twice.
      const { count } = await db.notification.updateMany({ where: { id: n.id, deliveryStatus: "pending" }, data: { deliveryStatus: "sending" } });
      if (count !== 1) continue;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: slackText(n) }),
          signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`Slack responded ${res.status}`);
        await db.notification.update({ where: { id: n.id }, data: { deliveryStatus: "sent", deliveryError: null } });
        result.sent++;
      } catch (err) {
        const message = err instanceof Error ? err.message : "delivery failed";
        await db.notification.update({ where: { id: n.id }, data: { deliveryStatus: "failed", deliveryError: message.slice(0, 500) } }).catch(() => {});
        result.failed++;
      }
    }
  } catch (err) {
    console.error("[keystone] notification delivery failed:", err instanceof Error ? err.message : "unknown error");
  }
  return result;
}

export type InAppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
};

/** The user's latest in-app notifications and unread count. */
export async function notificationsForUser(userId: string, take = 8): Promise<{ items: InAppNotification[]; unread: number }> {
  const [items, unread] = await Promise.all([
    db.notification.findMany({
      where: { channel: "in_app", userId },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, kind: true, title: true, body: true, href: true, readAt: true, createdAt: true },
    }),
    db.notification.count({ where: { channel: "in_app", userId, readAt: null } }),
  ]);
  return { items, unread };
}

/** Mark the user's notifications read (all, or the given IDs). Only touches their own rows. */
export async function markRead(userId: string, ids?: readonly string[]) {
  const { count } = await db.notification.updateMany({
    where: { channel: "in_app", userId, readAt: null, ...(ids && { id: { in: [...ids] } }) },
    data: { readAt: new Date() },
  });
  return count;
}
