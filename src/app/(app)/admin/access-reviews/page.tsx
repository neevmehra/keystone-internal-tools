import { ListChecks } from "lucide-react";
import Link from "next/link";
import { listAccessReviews } from "@/platform/access-reviews";
import { startAccessReview } from "@/platform/access-reviews/actions";
import { requirePagePermission } from "@/platform/auth";
import { ActionForm } from "@/platform/ui/ActionForm";
import { EmptyState } from "@/platform/ui/EmptyState";
import { RelativeTime } from "@/platform/ui/RelativeTime";
import { StatusBadge } from "@/platform/ui/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function defaultName(now = new Date()) {
  return `Q${Math.floor(now.getUTCMonth() / 3) + 1} ${now.getUTCFullYear()} access review`;
}

export default async function AccessReviewsPage() {
  await requirePagePermission("access_reviews:manage");
  const reviews = await listAccessReviews();
  const open = reviews.find((r) => r.status === "in_progress");

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_18rem]">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Reviews</h2>
        {reviews.length === 0 ? (
          <EmptyState icon={<ListChecks />} title="No access reviews yet" description="Start one to snapshot everyone's access and certify it." />
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Review</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Revoke</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/admin/access-reviews/${r.id}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">by {r.startedByName}</p>
                    </TableCell>
                    <TableCell><StatusBadge status={r.status} tone={r.status === "completed" ? "success" : "warning"} /></TableCell>
                    <TableCell className="tabular-nums">{r.summary.decided}/{r.summary.total}</TableCell>
                    <TableCell className="tabular-nums">{r.summary.revoke}</TableCell>
                    <TableCell><RelativeTime date={r.startedAt} /></TableCell>
                    <TableCell>
                      {r.completedAt ? (
                        <span className="text-sm">
                          <RelativeTime date={r.completedAt} /> <span className="text-xs text-muted-foreground">by {r.completedByName}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      <aside className="space-y-3">
        <h2 className="text-sm font-semibold">Start a review</h2>
        <div className="rounded-lg border bg-card p-4">
          {open ? (
            <p className="text-sm text-muted-foreground">
              <Link href={`/admin/access-reviews/${open.id}`} className="font-medium text-foreground hover:underline">
                {open.name}
              </Link>{" "}
              is in progress. Complete it before starting another.
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted-foreground">Snapshots every user&apos;s groups, roles and last sign-in right now.</p>
              <ActionForm
                action={startAccessReview}
                fields={[{ name: "name", label: "Name", required: true, defaultValue: defaultName() }]}
                submitLabel="Start review"
                successMessage="Review started"
              />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
