"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  icon?: ReactNode;
  badge?: number;
  exact?: boolean;
  children?: Array<{ href: string; label: string }>;
};

function Item({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <li>
      <Link
        href={item.href}
        className={cn(
          "flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4",
          active && "bg-muted font-medium text-foreground",
        )}
      >
        {item.icon}
        <span className="truncate">{item.label}</span>
        {item.badge ? <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{item.badge}</span> : null}
      </Link>
      {item.children && active && (
        <ul className="mt-0.5 ml-6 space-y-0.5 border-l pl-2">
          {item.children.map((c) => (
            <li key={c.href}>
              <Link href={c.href} className={cn("block rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground", pathname === c.href && "text-foreground")}>
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function SidebarNav({ main, tools, platform }: { main: NavItem[]; tools: NavItem[]; platform: NavItem[] }) {
  const pathname = usePathname();
  const section = (title: string, items: NavItem[], empty?: string) => (
    <div className="space-y-1">
      <p className="px-2 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">{title}</p>
      {items.length ? (
        <ul className="space-y-0.5">
          {items.map((i) => (
            <Item key={i.href} item={i} pathname={pathname} />
          ))}
        </ul>
      ) : (
        empty && <p className="px-2 text-xs text-muted-foreground">{empty}</p>
      )}
    </div>
  );
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto p-3">
      <ul className="space-y-0.5">
        {main.map((i) => (
          <Item key={i.href} item={i} pathname={pathname} />
        ))}
      </ul>
      {section("Tools", tools, "No tools yet")}
      {platform.length > 0 && section("Platform", platform)}
    </nav>
  );
}
