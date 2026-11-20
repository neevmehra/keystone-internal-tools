import { cn } from "@/lib/utils";
import { humanize } from "./format";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-zinc-700 ring-border",
  info: "bg-blue-50 text-blue-700 ring-blue-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
};

const DEFAULT_TONES: Record<string, Tone> = {
  pending: "warning",
  approved: "info",
  executed: "success",
  settled: "success",
  active: "success",
  succeeded: "success",
  rejected: "danger",
  failed: "danger",
  declined: "danger",
  closed: "neutral",
  restricted: "warning",
  refunded: "neutral",
  high: "danger",
  medium: "warning",
  low: "neutral",
};

export function StatusBadge({ status, tone, className }: { status: string; tone?: Tone; className?: string }) {
  const t = tone ?? DEFAULT_TONES[status] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        TONES[t],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {humanize(status)}
    </span>
  );
}
