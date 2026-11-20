/**
 * Launches a Devin session when an admin approves a tool request.
 *
 * The approvals engine runs this at most once per approval (idempotency
 * key), and `run` also refuses to start a second session if one is already
 * recorded. In simulation mode (no DEVIN_API_KEY / DEVIN_ORG_ID) it makes
 * no network call: it records the exact request body instead.
 */
import { registerExecutor } from "@/platform/approvals";
import { db } from "@/platform/db";
import { NotFoundError } from "@/platform/errors";
import { buildSessionBody, getDevinClient, getDevinConfig, isLiveMode, simulatedRequest, type SessionInfo } from "./devin";
import { LAUNCH_ACTION } from "./index";

type Payload = { toolRequestId: string };
export type LaunchResult =
  | { mode: "simulation"; request: ReturnType<typeof simulatedRequest> }
  | { mode: "live"; session: SessionInfo; reused: boolean };

export async function launchForRequest(toolRequestId: string): Promise<LaunchResult> {
  const req = await db.toolRequest.findUnique({ where: { id: toolRequestId } });
  if (!req) throw new NotFoundError("Request");
  const cfg = getDevinConfig();
  const body = buildSessionBody(req, cfg);
  if (!isLiveMode(cfg)) return { mode: "simulation", request: simulatedRequest(cfg, body) };
  if (req.devinSessionId) {
    return {
      mode: "live",
      reused: true,
      session: { id: req.devinSessionId, url: req.devinSessionUrl, status: req.devinStatus, pullRequest: null, acus: req.acusUsed },
    };
  }
  return { mode: "live", reused: false, session: await getDevinClient(cfg).createSession(body) };
}

registerExecutor<Payload, LaunchResult>(LAUNCH_ACTION, {
  run: ({ payload }) => launchForRequest(payload.toolRequestId),
  apply: async ({ payload, tx, result }) => {
    const now = new Date();
    if (result.mode === "simulation") {
      await tx.toolRequest.update({
        where: { id: payload.toolRequestId },
        data: { mode: "simulation", status: "ready_simulation", simulatedPayload: JSON.stringify(result.request), launchedAt: now },
      });
      return;
    }
    await tx.toolRequest.update({
      where: { id: payload.toolRequestId },
      data: {
        mode: "live",
        status: "building",
        devinSessionId: result.session.id,
        devinSessionUrl: result.session.url,
        devinStatus: result.session.status,
        launchedAt: now,
        lastSyncedAt: now,
      },
    });
  },
});
