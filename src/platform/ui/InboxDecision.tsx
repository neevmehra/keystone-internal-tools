"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { decideFromInboxAction } from "@/platform/approvals/actions";

/**
 * Approve or reject from the inbox. Approve is one click. Reject opens an
 * inline field for the reason (required, and it lands in the audit log).
 */
export function InboxDecision({ requestId, summary }: { requestId: string; summary?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (rejecting) input.current?.focus();
  }, [rejecting]);

  const decide = (decision: "approve" | "reject") => {
    if (decision === "reject" && !reason.trim()) {
      input.current?.focus();
      toast.error("Add a reason for rejecting.");
      return;
    }
    startTransition(async () => {
      const res = await decideFromInboxAction(requestId, decision, decision === "reject" ? reason : undefined);
      if (res.ok) toast.success(summary ? `${res.message}: ${summary}` : res.message);
      else toast.error(res.message);
      setRejecting(false);
      setReason("");
      router.refresh();
    });
  };

  if (rejecting) {
    return (
      <form
        className="flex flex-wrap items-center justify-end gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          decide("reject");
        }}
      >
        <Input
          ref={input}
          aria-label="Reason for rejecting"
          placeholder="Why are you rejecting?"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setRejecting(false);
              setReason("");
            }
          }}
          className="h-8 w-44 text-xs sm:w-52"
          disabled={pending}
        />
        <Button type="submit" size="sm" variant="destructive" className="h-8" disabled={pending}>
          {pending ? "Rejecting…" : "Reject"}
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="size-8"
          aria-label="Cancel"
          disabled={pending}
          onClick={() => {
            setRejecting(false);
            setReason("");
          }}
        >
          <X />
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:justify-end">
      <Button size="sm" variant="outline" className="h-8 text-primary hover:bg-primary/5 hover:text-primary" disabled={pending} onClick={() => decide("approve")}>
        <Check /> {pending ? "Approving…" : "Approve"}
      </Button>
      <Button size="sm" variant="ghost" className="h-8 text-muted-foreground hover:bg-destructive/5 hover:text-destructive" disabled={pending} onClick={() => setRejecting(true)}>
        Reject…
      </Button>
    </div>
  );
}
