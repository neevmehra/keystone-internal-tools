import { tools } from "@/tools";
import type { AuditEventView } from "./index";

/**
 * Where an audit event's record lives in the app, if anywhere. Tool records
 * open on the tool's detail page (`/tools/<slug>/<id>`, the scaffold's
 * convention); platform records open on their own pages.
 */
export function recordHref(event: Pick<AuditEventView, "tool" | "entityType" | "entityId" | "after" | "before">): string | null {
  const snapshot = event.after ?? event.before ?? {};
  switch (event.entityType) {
    case "AccessReview":
      return `/admin/access-reviews/${event.entityId}`;
    case "AccessReviewItem":
      return typeof snapshot.reviewId === "string" ? `/admin/access-reviews/${snapshot.reviewId}` : null;
    case "User":
      return "/admin/access";
    case "ApprovalRequest":
    case "AuditExport":
    case "EvidencePack":
      return null;
  }
  if (tools.some((t) => t.slug === event.tool)) return `/tools/${event.tool}/${event.entityId}`;
  return null;
}

/** The audit log filtered to one record's full history. */
export function historyHref(event: Pick<AuditEventView, "entityType" | "entityId">): string {
  const qs = new URLSearchParams({ entityType: event.entityType, entityId: event.entityId });
  return `/audit?${qs}`;
}
