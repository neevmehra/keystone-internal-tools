"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { approveRequestAction, executeRequestAction, rejectRequestAction, type ApprovalActionResult } from "@/platform/approvals/actions";

export function ApprovalButtons({ requestId, canDecide, canExecute }: { requestId: string; canDecide: boolean; canExecute: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  const go = (fn: () => Promise<ApprovalActionResult>) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      router.refresh();
    });

  return (
    <div className="space-y-2">
      {canDecide && (
        <>
          <Textarea
            placeholder="Reason (required to reject)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-16 text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => go(() => approveRequestAction(requestId, reason || undefined))}>
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => (reason.trim() ? go(() => rejectRequestAction(requestId, reason)) : toast.error("Add a reason to reject."))}
            >
              Reject
            </Button>
          </div>
        </>
      )}
      {canExecute && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => go(() => executeRequestAction(requestId))}>
          Retry execution
        </Button>
      )}
    </div>
  );
}
