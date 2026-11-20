import { StatusBadge, formatAbsolute } from "@/platform/ui";
import { daysLeft, urgency } from "../rules";

/** Response deadline with an overdue / due-soon flag for active disputes. */
export function DeadlineBadge({ status, respondBy, now = new Date() }: { status: string; respondBy: Date; now?: Date }) {
  const u = urgency({ status, respondBy }, now);
  const date = <span className="tabular-nums text-muted-foreground">{formatAbsolute(respondBy).split(",")[0]}</span>;
  if (u === "overdue") {
    return (
      <span className="inline-flex items-center gap-2">
        <StatusBadge status="overdue" tone="danger" />
        {date}
      </span>
    );
  }
  if (u === "due_soon") {
    const d = daysLeft(respondBy, now);
    return (
      <span className="inline-flex items-center gap-2">
        <StatusBadge status={d <= 0 ? "due today" : `due in ${d}d`} tone="warning" />
        {date}
      </span>
    );
  }
  if (u === "ok") return <span className="tabular-nums">{daysLeft(respondBy, now)} days · {date}</span>;
  return date;
}
