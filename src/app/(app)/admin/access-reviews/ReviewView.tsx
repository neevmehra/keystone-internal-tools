import { AlertTriangle, ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { revocationList, STALE_AFTER_DAYS, type getAccessReview } from "@/platform/access-reviews";
import type { CurrentUser } from "@/platform/auth/types";
import { maskRecord } from "@/platform/rbac/mask";
import { RelativeTime } from "@/platform/ui/RelativeTime";
import { StatCards } from "@/platform/ui/StatCards";
import { StatusBadge } from "@/platform/ui/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RoleChips } from "../RoleChips";
import { CompleteReviewButton, DecisionControls } from "./ReviewControls";

type Review = NonNullable<Awaited<ReturnType<typeof getAccessReview>>>;

/** One review: progress, revocations, and a keep/revoke decision per user. */
export function ReviewView({ review, viewer }: { review: Review; viewer: CurrentUser }) {
  const { summary } = review;
  const remaining = summary.total - summary.decided;
  const inProgress = review.status === "in_progress";
  const revocations = revocationList(review.items);
  const pct = summary.total ? Math.round((summary.decided / summary.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/access-reviews" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3" /> All reviews
          </Link>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{review.name}</h2>
            <StatusBadge status={review.status} tone={inProgress ? "warning" : "success"} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Started <RelativeTime date={review.startedAt} /> by {review.startedByName}
            {review.completedAt && (
              <>
                {" "}· Completed <RelativeTime date={review.completedAt} /> by {review.completedByName}
              </>
            )}
          </p>
        </div>
        {inProgress ? (
          <CompleteReviewButton reviewId={review.id} remaining={remaining} />
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
            <Lock className="size-3" /> Read-only
          </span>
        )}
      </div>

      <StatCards
        items={[
          { label: "Reviewed", value: `${summary.decided}/${summary.total}`, hint: `${pct}% done` },
          { label: "Keep", value: summary.keep },
          { label: "Revoke", value: summary.revoke },
          { label: "Stale accounts", value: summary.stale, hint: `no sign-in for ${STALE_AFTER_DAYS}+ days` },
        ]}
      />
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      {revocations.length > 0 && (
        <section className="rounded-lg border border-red-200 bg-red-50/60 p-4">
          <h3 className="text-sm font-semibold text-red-900">Remove from these IdP groups</h3>
          <p className="mt-0.5 text-xs text-red-900/80">Access is managed in the identity provider. Removing the group removes the role at next sign-in.</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {revocations.map((r) => (
              <li key={r.userEmail} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.userName}</span>
                <RoleChips roles={r.groups} empty="No groups" />
                {r.note && <span className="text-xs text-muted-foreground">“{r.note}”</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Groups at review start</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead>Decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {review.items.map((i) => (
              <TableRow key={i.id} className={i.stale && !i.decision ? "bg-amber-50/50" : undefined}>
                <TableCell>
                  <p className="font-medium">{i.userName}</p>
                  <p className="text-xs text-muted-foreground">{maskRecord({ email: i.userEmail }, ["email"], viewer).email}</p>
                </TableCell>
                <TableCell><RoleChips roles={i.groups} empty="No groups" /></TableCell>
                <TableCell><RoleChips roles={i.roles} empty="No role" /></TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-sm">
                    {i.lastLoginAt ? <RelativeTime date={i.lastLoginAt} /> : <span className="text-muted-foreground">Never</span>}
                    {i.stale && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800">
                        <AlertTriangle className="size-3" /> Stale
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {inProgress ? (
                    <DecisionControls itemId={i.id} decision={i.decision} note={i.note} self={i.userId === viewer.id} />
                  ) : null}
                  {i.decision && (
                    <p className={inProgress ? "mt-1 text-[11px] text-muted-foreground" : "text-sm"}>
                      <StatusBadge status={i.decision} tone={i.decision === "keep" ? "success" : "danger"} />{" "}
                      <span className="text-xs text-muted-foreground">
                        {i.decidedByName}
                        {i.note && ` · “${i.note}”`}
                      </span>
                    </p>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
