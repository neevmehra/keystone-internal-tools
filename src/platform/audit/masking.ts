import { maskRecord } from "@/platform/rbac/mask";
import { tools } from "@/tools";
import type { AuditEventView } from "./index";

/** PII fields on platform entities (e.g. `User`). Tools declare theirs in manifests. */
const PLATFORM_PII_FIELDS = ["email", "name"];

/** Mask PII inside audit before/after snapshots for users without `pii:read`. */
export function maskAuditEvent(event: AuditEventView, user: { permissions: readonly string[] }): AuditEventView {
  const toolPii = tools.find((t) => t.slug === event.tool)?.piiFields ?? [];
  const fields = [...PLATFORM_PII_FIELDS, ...toolPii];
  return {
    ...event,
    before: event.before && maskRecord(event.before, fields, user),
    after: event.after && maskRecord(event.after, fields, user),
  };
}
