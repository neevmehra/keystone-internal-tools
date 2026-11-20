import { Check, Circle, Send, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CurrentUser } from "@/platform/auth/types";
import { latestRequestsForUser } from "@/platform/requests";
import { STATUS_LABELS, STATUS_TONES, timeline, type DisplayStatus } from "@/platform/requests/status";
import { EmptyState } from "@/platform/ui/EmptyState";
import { RelativeTime } from "@/platform/ui/RelativeTime";
import { StatusBadge } from "@/platform/ui/StatusBadge";

export function RequestStatusBadge({ status }: { status: DisplayStatus }) {
  return <StatusBadge status={STATUS_LABELS[status]} tone={STATUS_TONES[status]} />;
}

export const kindLabel = (kind: string) => (kind === "change_tool" ? "Change" : "New tool");

/** Submitted, Approved, Devin building, PR open, Merged. */
export function RequestTimeline({ status, mode }: { status: DisplayStatus; mode: string | null }) {
  const steps = timeline(status, mode);
  return (
    <ol className="flex flex-wrap items-center gap-y-2 rounded-lg border bg-card px-4 py-3" aria-label="Request status">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center">
          <span
            className={cn(
              "flex items-center gap-1.5 text-xs whitespace-nowrap",
              s.state === "done" && "text-foreground",
              s.state === "current" && "font-semibold text-primary",
              s.state === "failed" && "font-semibold text-destructive",
              s.state === "upcoming" && "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full border [&_svg]:size-3",
                s.state === "done" && "border-emerald-300 bg-emerald-50 text-emerald-700",
                s.state === "current" && "border-primary bg-primary/10",
                s.state === "failed" && "border-destructive/40 bg-destructive/10",
              )}
            >
              {s.state === "done" ? <Check /> : s.state === "failed" ? <X /> : <Circle className="fill-current opacity-60" />}
            </span>
            {s.label}
          </span>
          {i < steps.length - 1 && <span className={cn("mx-3 h-px w-8 bg-border", s.state === "done" && "bg-emerald-300")} />}
        </li>
      ))}
    </ol>
  );
}

/** A number with the formula behind it on hover. */
export function Explained({ formula, children }: { formula: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="cursor-help underline decoration-muted-foreground/40 decoration-dotted underline-offset-4" />}>
        {children}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{formula}</TooltipContent>
    </Tooltip>
  );
}

/** Portal home: the user's latest requests. */
export async function YourRequests({ user, emptyIcon }: { user: CurrentUser; emptyIcon?: ReactNode }) {
  const requests = user.permissions.includes("requests:create") ? await latestRequestsForUser(user, 3) : [];
  if (requests.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon ?? <Send />}
        title="No requests yet"
        description="Ask for a new tool or a change in plain language, and track it here."
        action={user.permissions.includes("requests:create") ? { label: "Build with Devin", href: "/build" } : undefined}
      />
    );
  }
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {requests.map((r) => (
        <li key={r.id}>
          <Link href={`/build/requests/${r.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.title}</p>
              <p className="text-xs text-muted-foreground">
                {kindLabel(r.kind)}
                {r.toolSlug && <> · {r.toolSlug}</>} · <RelativeTime date={r.createdAt} className="text-muted-foreground" />
              </p>
            </div>
            <RequestStatusBadge status={r.display} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
