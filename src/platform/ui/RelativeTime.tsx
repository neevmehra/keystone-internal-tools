import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAbsolute, formatRelative } from "./format";

/** Relative date with the absolute date on hover. */
export function RelativeTime({ date, className }: { date: Date; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<time dateTime={date.toISOString()} className={className ?? "whitespace-nowrap text-muted-foreground"} />}
      >
        {formatRelative(date)}
      </TooltipTrigger>
      <TooltipContent>{formatAbsolute(date)}</TooltipContent>
    </Tooltip>
  );
}
