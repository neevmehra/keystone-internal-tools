/**
 * Request status, derived from the ToolRequest and its approval. Pure, so
 * pages, the impact math and tests all agree on what each status means.
 */
import type { SessionInfo } from "./devin";

export const DISPLAY_STATUSES = [
  "submitted",
  "rejected",
  "approved",
  "launch_failed",
  "ready_simulation",
  "building",
  "pr_open",
  "pr_closed",
  "merged",
] as const;
export type DisplayStatus = (typeof DISPLAY_STATUSES)[number];

export const STATUS_LABELS: Record<DisplayStatus, string> = {
  submitted: "Waiting for approval",
  rejected: "Rejected",
  approved: "Approved",
  launch_failed: "Launch failed",
  ready_simulation: "Ready to launch (simulation)",
  building: "Devin building",
  pr_open: "PR open",
  pr_closed: "PR closed",
  merged: "Merged",
};

export const STATUS_TONES: Record<DisplayStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  submitted: "warning",
  rejected: "danger",
  approved: "info",
  launch_failed: "danger",
  ready_simulation: "info",
  building: "info",
  pr_open: "info",
  pr_closed: "neutral",
  merged: "success",
};

type RequestLike = { status: string; prState: string | null };
type ApprovalLike = { status: string } | null | undefined;

export function displayStatus(req: RequestLike, approval: ApprovalLike): DisplayStatus {
  if (req.status === "merged" || req.prState === "merged") return "merged";
  if (req.prState === "closed") return "pr_closed";
  if (req.status === "pr_open" || req.prState === "open") return "pr_open";
  if (req.status === "building") return "building";
  if (req.status === "ready_simulation") return "ready_simulation";
  if (approval?.status === "rejected") return "rejected";
  if (approval?.status === "failed" || req.status === "launch_failed") return "launch_failed";
  if (approval?.status === "approved" || approval?.status === "executed") return "approved";
  return "submitted";
}

/** Status to store after reading a session from the API. */
export function statusFromSession(info: Pick<SessionInfo, "pullRequest">): "building" | "pr_open" | "merged" {
  const state = info.pullRequest?.state;
  if (state === "merged") return "merged";
  if (info.pullRequest) return "pr_open";
  return "building";
}

export type TimelineStep = { key: string; label: string; state: "done" | "current" | "upcoming" | "failed" };

/** Submitted, Approved, Devin building, PR open, Merged. */
export function timeline(status: DisplayStatus, mode: string | null): TimelineStep[] {
  const buildLabel = mode === "simulation" || status === "ready_simulation" ? "Ready to launch (simulation)" : "Devin building";
  const steps = [
    { key: "submitted", label: "Submitted" },
    { key: "approved", label: status === "rejected" ? "Rejected" : "Approved" },
    { key: "building", label: status === "launch_failed" ? "Launch failed" : buildLabel },
    { key: "pr_open", label: status === "pr_closed" ? "PR closed" : "PR open" },
    { key: "merged", label: "Merged" },
  ];
  // Index of the step the request is currently on, and whether it failed there.
  const position: Record<DisplayStatus, [number, boolean]> = {
    submitted: [1, false],
    rejected: [1, true],
    approved: [2, false],
    launch_failed: [2, true],
    ready_simulation: [2, false],
    building: [2, false],
    pr_open: [3, false],
    pr_closed: [3, true],
    merged: [5, false],
  };
  const [at, failed] = position[status];
  return steps.map((s, i) => ({
    ...s,
    state: i < at ? "done" : i === at ? (failed ? "failed" : "current") : "upcoming",
  }));
}
