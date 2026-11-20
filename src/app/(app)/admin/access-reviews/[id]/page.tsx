import { notFound } from "next/navigation";
import { getAccessReview } from "@/platform/access-reviews";
import { requirePagePermission } from "@/platform/auth";
import { ReviewView } from "../ReviewView";

export default async function AccessReviewPage({ params }: PageProps<"/admin/access-reviews/[id]">) {
  const viewer = await requirePagePermission("access_reviews:manage");
  const { id } = await params;
  const review = await getAccessReview(id);
  if (!review) notFound();
  return <ReviewView review={review} viewer={viewer} />;
}
