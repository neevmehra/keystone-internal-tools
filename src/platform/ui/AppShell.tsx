import { ClipboardCheck, Hammer, Home, ScrollText, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { countPendingForUser } from "@/platform/approvals";
import { signOutAction } from "@/platform/auth/actions";
import type { CurrentUser } from "@/platform/auth/types";
import { hasPermission } from "@/platform/rbac";
import { toolsForUser } from "@/platform/registry";
import { PLATFORM_ROUTES } from "./nav-config";
import { SidebarNav, type NavItem } from "./SidebarNav";
import { ToolIcon } from "./ToolIcon";

export function envLabel() {
  return process.env.KEYSTONE_ENV_LABEL || "DEMO";
}

async function navFor(user: CurrentUser): Promise<{ main: NavItem[]; tools: NavItem[]; platform: NavItem[] }> {
  const can = (slot: keyof typeof PLATFORM_ROUTES) => PLATFORM_ROUTES[slot].enabled && hasPermission(user, PLATFORM_ROUTES[slot].permission);
  const platform: NavItem[] = [];
  if (can("approvals")) {
    const pending = await countPendingForUser(user);
    platform.push({ href: PLATFORM_ROUTES.approvals.href, label: "Approvals", icon: <ClipboardCheck />, badge: pending || undefined });
  }
  if (can("build")) platform.push({ href: PLATFORM_ROUTES.build.href, label: "Build with Devin", icon: <Hammer /> });
  if (can("audit")) platform.push({ href: PLATFORM_ROUTES.audit.href, label: "Audit", icon: <ScrollText /> });
  if (can("admin")) platform.push({ href: PLATFORM_ROUTES.admin.href, label: "Admin", icon: <Settings /> });
  return {
    main: [{ href: "/", label: "Home", icon: <Home />, exact: true }],
    tools: toolsForUser(user).map((t) => ({
      href: t.nav[0]?.href ?? `/tools/${t.slug}`,
      label: t.name,
      icon: <ToolIcon name={t.icon} />,
      children: t.nav.length > 1 ? t.nav.map((n) => ({ href: n.href, label: n.label })) : undefined,
    })),
    platform,
  };
}

export async function AppShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const nav = await navFor(user);
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-12 items-center gap-2 border-b px-4">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">K</div>
          <span className="text-sm font-semibold tracking-tight">Keystone</span>
          <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-800 ring-1 ring-amber-300 ring-inset">
            {envLabel()}
          </span>
        </div>
        <SidebarNav main={nav.main} tools={nav.tools} platform={nav.platform} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-12 items-center justify-between gap-4 border-b bg-background/95 px-5 backdrop-blur">
          <div className="flex items-center gap-2 md:hidden">
            <span className="text-sm font-semibold">Keystone</span>
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">{envLabel()}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-1 sm:flex">
              {user.groups.map((g) => (
                <span key={g} className="rounded-md border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {g}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{initials}</div>
              <div className="hidden leading-tight sm:block">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-[11px] text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <form action={signOutAction}>
              <button type="submit" className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
