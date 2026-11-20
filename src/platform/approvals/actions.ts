"use server";

import { getCurrentUser } from "@/platform/auth/current-user";
import { KeystoneError, UnauthenticatedError } from "@/platform/errors";
import "@/tools/executors";
import { approve, execute, hasExecutor, reject } from "./index";

export type ApprovalActionResult = { ok: boolean; message: string };

async function run(fn: () => Promise<string>): Promise<ApprovalActionResult> {
  try {
    return { ok: true, message: await fn() };
  } catch (err) {
    if (err instanceof KeystoneError) return { ok: false, message: err.message };
    console.error("[keystone] approval action failed:", err instanceof Error ? err.message : "unknown error");
    return { ok: false, message: "Something went wrong." };
  }
}

async function user() {
  const u = await getCurrentUser();
  if (!u) throw new UnauthenticatedError();
  return u;
}

export async function approveRequestAction(requestId: string, reason?: string) {
  return run(async () => {
    const u = await user();
    const approved = await approve(u, requestId, { reason });
    if (!hasExecutor(approved.actionType)) return "Approved";
    const outcome = await execute(u, requestId);
    return outcome.status === "executed" ? "Approved and executed" : `Approved, but execution failed: ${outcome.error}`;
  });
}

export async function rejectRequestAction(requestId: string, reason: string) {
  return run(async () => {
    await reject(await user(), requestId, { reason });
    return "Rejected";
  });
}

export async function executeRequestAction(requestId: string) {
  return run(async () => {
    const outcome = await execute(await user(), requestId);
    if (outcome.status === "failed") throw new KeystoneError("INTEGRATION_ERROR", `Execution failed: ${outcome.error}`);
    return outcome.alreadyExecuted ? "Already executed" : "Executed";
  });
}
