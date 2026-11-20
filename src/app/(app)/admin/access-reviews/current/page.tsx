import { ListChecks } from "lucide-react";
import { getAccessReview } from "@/platform/access-reviews";
import { requirePagePermission } from "@/platform/auth";
import { db } from "@/platform/db";
import { EmptyState } from "@/platform/ui/EmptyState";
import { ReviewView } from "../ReviewView";

/** Stable link to whichever review is in progress. */
export default async function CurrentAccessReviewPage() {
  const viewer = await requirePagePermission("access_reviews:manage");
  const open = await db.accessReview.findFirst({ where: { status: "in_progress" }, orderBy: { startedAt: "desc" } });
  const review = open && (await getAccessReview(open.id));
  if (!review) {
    return (
      <EmptyState
        icon={<ListChecks />}
        title="No review in progress"
        description="Start one to snapshot everyone's access and certify it."
        action={{ label: "Access reviews", href: "/admin/access-reviews" }}
      />
    );
  }
  return <ReviewView review={review} viewer={viewer} />;
}
