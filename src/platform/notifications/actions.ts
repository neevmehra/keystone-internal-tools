"use server";

import { getCurrentUser } from "@/platform/auth/current-user";
import { markRead } from "./index";

/**
 * Marks the signed-in user's own notifications as read. Read state is a
 * per-user UI preference, not business data, so it isn't audited.
 */
export async function markNotificationsReadAction(ids?: string[]): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const clean = ids?.filter((id) => typeof id === "string" && id.length < 64).slice(0, 100);
  await markRead(user.id, clean);
  return { ok: true };
}
