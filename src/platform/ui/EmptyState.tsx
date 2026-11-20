import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Empty state with an optional next action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: { label: string; href: string } | ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center", className)}>
      {icon && <div className="mb-3 flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-4">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && (
        <div className="mt-4">
          {typeof action === "object" && action !== null && "href" in action && "label" in action ? (
            <Link href={action.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {action.label}
            </Link>
          ) : (
            (action as ReactNode)
          )}
        </div>
      )}
    </div>
  );
}
