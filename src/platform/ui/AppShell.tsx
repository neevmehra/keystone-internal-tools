import { BarChart3, ClipboardCheck, Hammer, Home, ScrollText, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { countPendingForUser } from "@/platform/approvals";
import type { CurrentUser } from "@/platform/auth/types";
import { notificationsForUser } from "@/platform/notifications";
import { hasPermission } from "@/platform/rbac";
import { toolsForUser } from "@/platform/registry";
import { CommandSearch } from "./CommandSearch";
import { groupLabel, roleLabel } from "./labels";
import { MobileNav } from "./MobileNav";
import { PLATFORM_ROUTES } from "./nav-config";
import { NotificationBell } from "./NotificationBell";
import { SidebarNav, type NavItem } from "./SidebarNav";
import { ToolIcon } from "./ToolIcon";
import { UserMenu } from "./UserMenu";

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
  if (can("insights")) platform.push({ href: PLATFORM_ROUTES.insights.href, label: "Insights", icon: <BarChart3 /> });
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
  const [nav, notifications] = await Promise.all([navFor(user), notificationsForUser(user.id)]);
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const roles = user.roles.map(roleLabel);
  const brand = (
    <div className="flex items-center gap-2">
      <div className="flex size-6 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">K</div>
      <span className="text-sm font-semibold tracking-tight">Keystone</span>
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-800 ring-1 ring-amber-300 ring-inset">
        {envLabel()}
      </span>
    </div>
  );
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-14 items-center border-b px-4">{brand}</div>
        <SidebarNav main={nav.main} tools={nav.tools} platform={nav.platform} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-5">
          <MobileNav brand={brand} main={nav.main} tools={nav.tools} platform={nav.platform} />
          <div className="md:hidden">{brand}</div>
          <div className="ml-auto flex items-center gap-1 sm:gap-2 md:ml-0 md:flex-1">
            {/* Global customer search: anyone who can open a tool can look customers up. */}
            {nav.tools.length > 0 && <CommandSearch />}
            <div className="flex items-center gap-1 sm:gap-2 md:ml-auto">
              {roles[0] && (
                <span
                  title={`Signed in as ${roles.join(", ")}`}
                  className="hidden rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground lg:inline"
                >
                  {roles[0]}
                </span>
              )}
              <NotificationBell
                unread={notifications.unread}
                items={notifications.items.map((n) => ({
                  id: n.id,
                  title: n.title,
                  body: n.body,
                  href: n.href,
                  read: n.readAt !== null,
                  createdAt: n.createdAt.toISOString(),
                }))}
              />
              <UserMenu
                name={user.name}
                email={user.email}
                initials={initials}
                roles={roles}
                groups={user.groups.map((g) => ({ label: groupLabel(g), raw: g }))}
              />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
