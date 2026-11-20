"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completeAccessReview, decideAccessReviewItem } from "@/platform/access-reviews/actions";

/** Keep / revoke buttons for one user in an in-progress review. Revoking needs a note. */
export function DecisionControls({ itemId, decision, note, self }: { itemId: string; decision: string | null; note: string | null; self: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState(note ?? "");
  const [revoking, setRevoking] = useState(false);

  if (self) return <span className="text-xs text-muted-foreground">You can&apos;t review your own access</span>;

  const decide = (d: "keep" | "revoke") =>
    start(async () => {
      const res = await decideAccessReviewItem({ itemId, decision: d, note: draft.trim() || undefined });
      if (res.ok) {
        toast.success(d === "keep" ? "Access kept" : "Marked for revocation");
        setRevoking(false);
        router.refresh();
      } else {
        toast.error(res.error.issues?.[0]?.message ?? res.error.message);
      }
    });

  if (revoking) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Why revoke?"
          className="h-7 w-44 text-xs"
          onKeyDown={(e) => e.key === "Enter" && decide("revoke")}
        />
        <Button size="sm" variant="destructive" disabled={pending || !draft.trim()} onClick={() => decide("revoke")}>
          Revoke
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setRevoking(false)}>
          Cancel
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Button size="sm" variant={decision === "keep" ? "default" : "outline"} disabled={pending} onClick={() => decide("keep")}>
        Keep
      </Button>
      <Button size="sm" variant={decision === "revoke" ? "destructive" : "outline"} disabled={pending} onClick={() => setRevoking(true)}>
        Revoke
      </Button>
    </div>
  );
}

export function CompleteReviewButton({ reviewId, remaining }: { reviewId: string; remaining: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending || remaining > 0}
      title={remaining > 0 ? `${remaining} still need a decision` : undefined}
      onClick={() =>
        start(async () => {
          const res = await completeAccessReview({ reviewId });
          if (res.ok) {
            toast.success("Review completed. It is now read-only.");
            router.refresh();
          } else toast.error(res.error.message);
        })
      }
    >
      {remaining > 0 ? `${remaining} left to review` : "Complete review"}
    </Button>
  );
}
