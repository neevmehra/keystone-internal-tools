"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { markNotificationsReadAction } from "@/platform/notifications/actions";
import { formatRelative } from "./format";

export type BellItem = { id: string; title: string; body: string | null; href: string | null; read: boolean; createdAt: string };

/** Top-bar bell: unread count, latest notifications, each linking to its record. */
export function NotificationBell({ items, unread }: { items: BellItem[]; unread: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const open = (item: BellItem) =>
    startTransition(async () => {
      if (!item.read) await markNotificationsReadAction([item.id]);
      if (item.href) router.push(item.href);
      router.refresh();
    });

  const markAll = () =>
    startTransition(async () => {
      await markNotificationsReadAction();
      router.refresh();
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button type="button" onClick={markAll} className="text-xs text-muted-foreground hover:text-foreground">
              Mark all read
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto p-1">
            {items.map((item) => (
              <DropdownMenuItem key={item.id} onClick={() => open(item)} className="items-start gap-2 px-2 py-2">
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", item.read ? "bg-transparent" : "bg-primary")} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm leading-snug", !item.read && "font-medium")}>{item.title}</span>
                  {item.body && <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{item.body}</span>}
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{formatRelative(new Date(item.createdAt))}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
