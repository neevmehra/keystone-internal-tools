"use server";

/**
 * Server actions for the request center. Each export checks the signed-in
 * user's permissions (defineAction does it for the writes).
 */
import { getCurrentUser } from "@/platform/auth/current-user";
import { KeystoneError } from "@/platform/errors";
import { getDevinClient, getDevinConfig, isLiveMode } from "./devin";
import { canViewRequest, getRequest } from "./index";
import { linkPullRequest, setAcusUsed, submitToolRequest, syncSession } from "./mutations";

type InputOf<F> = F extends (input: infer I) => unknown ? I : never;

export async function submitToolRequestAction(input: InputOf<typeof submitToolRequest>) {
  return submitToolRequest(input);
}

export async function setAcusUsedAction(input: InputOf<typeof setAcusUsed>) {
  return setAcusUsed(input);
}

export async function linkPullRequestAction(input: InputOf<typeof linkPullRequest>) {
  return linkPullRequest(input);
}

export type RefreshResult = { ok: boolean; message: string };

/** Pull the session status, PR and ACU usage from the Devin API. No background jobs. */
export async function refreshRequestStatus(requestId: string): Promise<RefreshResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "You need to sign in." };
  const req = await getRequest(String(requestId));
  if (!req || !canViewRequest(user, req)) return { ok: false, message: "Request not found." };
  if (req.mode !== "live" || !req.devinSessionId) {
    return { ok: false, message: "Nothing to refresh: this request has no live Devin session." };
  }
  const cfg = getDevinConfig();
  if (!isLiveMode(cfg)) return { ok: false, message: "The Devin API isn't configured on this server." };
  try {
    const info = await getDevinClient(cfg).getSession(req.devinSessionId);
    const res = await syncSession({
      requestId: req.id,
      devinStatus: info.status,
      prUrl: info.pullRequest?.url ?? null,
      prState: info.pullRequest?.state ?? null,
      acus: info.acus,
    });
    if (!res.ok) return { ok: false, message: res.error.message };
    return { ok: true, message: info.pullRequest ? `Status updated: PR ${info.pullRequest.state ?? "open"}` : "Status updated: Devin is still working" };
  } catch (err) {
    return { ok: false, message: err instanceof KeystoneError ? err.message : "Couldn't refresh the status." };
  }
}
