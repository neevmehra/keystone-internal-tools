import type { z } from "zod";
import { recordAudit } from "@/platform/audit";
import { getCurrentUser } from "@/platform/auth/current-user";
import type { CurrentUser } from "@/platform/auth/types";
import { db, type Tx } from "@/platform/db";
import { KeystoneError, UnauthenticatedError, ValidationError, type KeystoneErrorCode } from "@/platform/errors";
import { requirePermission } from "@/platform/rbac";
import type { Permission } from "@/platform/rbac/permissions";

export type ActionRunResult<R> = {
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  result: R;
  /** Optional link to an ApprovalRequest, stored on the audit event. */
  requestId?: string | null;
};

export type ActionDefinition<S extends z.ZodType, R> = {
  tool: string;
  name: string;
  permission: Permission;
  input: S;
  run: (ctx: { input: z.output<S>; user: CurrentUser; tx: Tx }) => Promise<ActionRunResult<R>>;
};

export type ActionResult<R> =
  | { ok: true; result: R; auditEventId: string }
  | { ok: false; error: { code: KeystoneErrorCode | "INTERNAL"; message: string; issues?: ValidationError["issues"] } };

export type Action<S extends z.ZodType, R> = ((input: z.input<S>) => Promise<ActionResult<R>>) & {
  definition: ActionDefinition<S, R>;
};

/**
 * The only way tools write data. In order: load the user, check the
 * permission, validate input, run inside a transaction, write the audit event
 * in the same transaction, return the result. If anything throws, both the
 * change and the audit event roll back.
 */
export function defineAction<S extends z.ZodType, R>(definition: ActionDefinition<S, R>): Action<S, R> {
  const action = async (rawInput: z.input<S>): Promise<ActionResult<R>> => {
    try {
      const user = await getCurrentUser();
      if (!user) throw new UnauthenticatedError();
      requirePermission(user, definition.permission);

      const parsed = definition.input.safeParse(rawInput);
      if (!parsed.success) {
        throw new ValidationError(
          "Some fields are invalid.",
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }

      const { out, auditEventId } = await db.$transaction(async (tx) => {
        const out = await definition.run({ input: parsed.data, user, tx });
        const audit = await recordAudit(tx, {
          actor: { id: user.id, name: user.name, roles: user.roles },
          tool: definition.tool,
          action: definition.name,
          entityType: out.entityType,
          entityId: out.entityId,
          before: out.before,
          after: out.after,
          requestId: out.requestId,
        });
        return { out, auditEventId: audit.id };
      });
      return { ok: true, result: out.result, auditEventId };
    } catch (err) {
      if (err instanceof KeystoneError) {
        return {
          ok: false,
          error: { code: err.code, message: err.message, ...(err instanceof ValidationError && { issues: err.issues }) },
        };
      }
      console.error(`[keystone] action ${definition.name} failed:`, err instanceof Error ? err.message : "unknown error");
      return { ok: false, error: { code: "INTERNAL", message: "Something went wrong. Nothing was saved." } };
    }
  };
  return Object.assign(action, { definition });
}
