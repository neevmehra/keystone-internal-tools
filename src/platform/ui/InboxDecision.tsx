"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { decideFromInboxAction } from "@/platform/approvals/actions";

/** Approve or reject from the inbox. Both need a reason, which lands in the audit log. */
export function InboxDecision({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  const decide = (decision: "approve" | "reject") => {
    if (!reason.trim()) {
      toast.error("Add a reason for your decision.");
      return;
    }
    startTransition(async () => {
      const res = await decideFromInboxAction(requestId, decision, reason);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      router.refresh();
    });
  };

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Input
        aria-label="Reason"
        placeholder="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && decide("approve")}
        className="h-7 w-40 text-xs"
        disabled={pending}
      />
      <Button size="sm" className="h-7" disabled={pending} onClick={() => decide("approve")}>
        Approve
      </Button>
      <Button size="sm" variant="outline" className="h-7 text-destructive" disabled={pending} onClick={() => decide("reject")}>
        Reject
      </Button>
    </div>
  );
}
