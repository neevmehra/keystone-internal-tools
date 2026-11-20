"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/platform/auth/actions";

export type UserMenuProps = {
  name: string;
  email: string;
  initials: string;
  /** Friendly role names, e.g. "Finance approver". */
  roles: string[];
  /** IdP groups: friendly label plus the raw group name. */
  groups: Array<{ label: string; raw: string }>;
};

/** Avatar menu in the top bar: who you are, what you can do, and sign out. */
export function UserMenu({ name, email, initials, roles, groups }: UserMenuProps) {
  const [pending, startTransition] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${name}`}
        className="flex h-9 items-center gap-2 rounded-md py-1 pr-1.5 pl-1 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:bg-muted"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{initials}</span>
        <span className="hidden max-w-36 truncate text-sm font-medium lg:block">{name}</span>
        <ChevronDown className="hidden size-3.5 text-muted-foreground lg:block" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-0">
        <div className="px-3 pt-3 pb-2.5">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
        <div className="space-y-2.5 border-t px-3 py-2.5">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">{roles.length === 1 ? "Role" : "Roles"}</p>
            <p className="mt-0.5 text-sm">{roles.length ? roles.join(", ") : "No role"}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Groups (from your identity provider)</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {groups.length ? (
                groups.map((g) => (
                  <span key={g.raw} title={g.raw} className="rounded-md border bg-muted/50 px-1.5 py-0.5 text-xs">
                    {g.label}
                  </span>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">None</span>
              )}
            </div>
          </div>
        </div>
        <DropdownMenuSeparator className="my-0" />
        <div className="p-1">
          <DropdownMenuItem
            disabled={pending}
            onClick={() => startTransition(() => signOutAction())}
            className="gap-2 px-2 py-1.5 text-sm"
          >
            <LogOut className="size-4" />
            {pending ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
