/**
 * Request center writes. Every one is a defineAction, so permission checks,
 * validation and the audit event come with it. actions.ts exposes the ones
 * the browser may call; syncSession is server-only (the server reads the
 * Devin API first, then records what it found).
 */
import { z } from "zod";
import { defineAction } from "@/platform/actions";
import { requestApproval } from "@/platform/approvals";
import { NotFoundError, PermissionDeniedError, ValidationError } from "@/platform/errors";
import { getTool } from "@/platform/registry";
import { canViewRequest, LAUNCH_ACTION, REQUESTS_TOOL } from "./index";
import { buildDevinPrompt, REQUEST_KINDS } from "./prompt";
import { statusFromSession } from "./status";

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((s) => (s ? s : null));

export const submitRequestInput = z
  .object({
    kind: z.enum(REQUEST_KINDS),
    title: z.string().trim().min(3, "Give it a short name.").max(120),
    toolSlug: z.string().trim().max(60).optional(),
    problem: z.string().trim().min(10, "Describe it in a sentence or two.").max(4000),
    audienceGroups: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    workflow: z.string().trim().min(5, "What do people need to do?").max(4000),
    signOff: optionalText,
    signOffAboveCents: z.number().int().nonnegative().max(1_000_000_000).optional(),
    involvesPii: z.boolean().default(false),
    movesMoney: z.boolean().default(false),
    peopleCount: z.number().int().min(1).max(10_000).optional(),
    hoursPerWeek: z.number().min(0).max(10_000).optional(),
  })
  .refine((v) => v.kind === "new_tool" || !!v.toolSlug, { path: ["toolSlug"], message: "Pick the tool to change." });

/** Submit a request. It waits for an admin (requests:approve) before Devin starts. */
export const submitToolRequest = defineAction({
  tool: REQUESTS_TOOL,
  name: "build.request.submit",
  permission: "requests:create",
  input: submitRequestInput,
  run: async ({ input, user, tx }) => {
    const tool = input.kind === "change_tool" && input.toolSlug ? getTool(input.toolSlug) : undefined;
    if (input.kind === "change_tool" && !tool) throw new ValidationError("That tool doesn't exist.", [{ path: "toolSlug", message: "Pick a tool from the list." }]);
    const toolSlug = input.kind === "change_tool" ? tool!.slug : null;
    const prompt = buildDevinPrompt({ ...input, toolSlug, toolName: tool?.name ?? null }, { name: user.name, groups: user.groups });

    const created = await tx.toolRequest.create({
      data: {
        kind: input.kind,
        toolSlug,
        title: input.title,
        problem: input.problem,
        audienceGroups: JSON.stringify(input.audienceGroups),
        workflow: input.workflow,
        signOff: input.signOff,
        signOffAboveCents: input.signOffAboveCents ?? null,
        involvesPii: input.involvesPii,
        movesMoney: input.movesMoney,
        peopleCount: input.peopleCount ?? null,
        hoursPerWeek: input.hoursPerWeek ?? null,
        prompt,
        status: "submitted",
        requestedById: user.id,
        requestedByName: user.name,
      },
    });
    const approval = await requestApproval(
      user,
      {
        tool: REQUESTS_TOOL,
        actionType: LAUNCH_ACTION,
        entityType: "ToolRequest",
        entityId: created.id,
        payload: { toolRequestId: created.id },
        approvePermission: "requests:approve",
        idempotencyKey: `toolreq_${created.id}`,
      },
      tx,
    );
    await tx.toolRequest.update({ where: { id: created.id }, data: { approvalRequestId: approval.id } });
    return {
      entityType: "ToolRequest",
      entityId: created.id,
      before: null,
      after: { kind: created.kind, title: created.title, toolSlug, status: "submitted" },
      result: { id: created.id },
      requestId: approval.id,
    };
  },
});

/** Admins record ACU usage when the API doesn't return it. */
export const setAcusUsed = defineAction({
  tool: REQUESTS_TOOL,
  name: "build.request.set_acus",
  permission: "requests:approve",
  input: z.object({ requestId: z.string().min(1), acus: z.coerce.number<string | number>().min(0, "ACUs can't be negative.").max(100_000) }),
  run: async ({ input, tx }) => {
    const before = await tx.toolRequest.findUnique({ where: { id: input.requestId } });
    if (!before) throw new NotFoundError("Request");
    const acus = Math.round(input.acus * 100) / 100;
    await tx.toolRequest.update({ where: { id: before.id }, data: { acusUsed: acus } });
    return { entityType: "ToolRequest", entityId: before.id, before: { acusUsed: before.acusUsed }, after: { acusUsed: acus }, result: { acus } };
  },
});

/**
 * Admins link a pull request by hand: for simulation mode, where the prompt
 * was pasted into Devin manually, or if the API didn't report the PR.
 */
export const linkPullRequest = defineAction({
  tool: REQUESTS_TOOL,
  name: "build.request.link_pr",
  permission: "requests:approve",
  input: z.object({
    requestId: z.string().min(1),
    prUrl: z.string().trim().url("Paste the full pull request URL.").max(500),
    prState: z.enum(["open", "merged", "closed"]),
  }),
  run: async ({ input, tx }) => {
    const before = await tx.toolRequest.findUnique({ where: { id: input.requestId } });
    if (!before) throw new NotFoundError("Request");
    const status = input.prState === "merged" ? "merged" : input.prState === "open" ? "pr_open" : before.status;
    const after = await tx.toolRequest.update({
      where: { id: before.id },
      data: {
        prUrl: input.prUrl,
        prState: input.prState,
        status,
        ...(input.prState === "merged" && !before.shippedAt && { shippedAt: new Date() }),
      },
    });
    return {
      entityType: "ToolRequest",
      entityId: before.id,
      before: { prUrl: before.prUrl, prState: before.prState, status: before.status },
      after: { prUrl: after.prUrl, prState: after.prState, status: after.status },
      result: { status },
    };
  },
});

/** Server-only: record what the Devin API reported for a session. */
export const syncSession = defineAction({
  tool: REQUESTS_TOOL,
  name: "build.request.sync",
  permission: "requests:create",
  input: z.object({
    requestId: z.string().min(1),
    devinStatus: z.string().max(100).nullable(),
    prUrl: z.string().max(500).nullable(),
    prState: z.string().max(40).nullable(),
    acus: z.number().min(0).nullable(),
  }),
  run: async ({ input, user, tx }) => {
    const before = await tx.toolRequest.findUnique({ where: { id: input.requestId } });
    if (!before) throw new NotFoundError("Request");
    if (!canViewRequest(user, before)) throw new PermissionDeniedError("admin:read", "You can only refresh your own requests.");
    const status = statusFromSession({ pullRequest: input.prUrl ? { url: input.prUrl, state: input.prState } : null });
    const after = await tx.toolRequest.update({
      where: { id: before.id },
      data: {
        devinStatus: input.devinStatus,
        prUrl: input.prUrl ?? before.prUrl,
        prState: input.prState ?? before.prState,
        acusUsed: input.acus ?? before.acusUsed,
        status,
        lastSyncedAt: new Date(),
        ...(status === "merged" && !before.shippedAt && { shippedAt: new Date() }),
      },
    });
    return {
      entityType: "ToolRequest",
      entityId: before.id,
      before: { status: before.status, devinStatus: before.devinStatus, prState: before.prState, acusUsed: before.acusUsed },
      after: { status: after.status, devinStatus: after.devinStatus, prState: after.prState, acusUsed: after.acusUsed },
      result: { status },
    };
  },
});
