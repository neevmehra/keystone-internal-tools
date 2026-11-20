import { ArrowRight, Boxes, Inbox, Send } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/platform/auth";
import { toolsForUser } from "@/platform/registry";
import { EmptyState } from "@/platform/ui/EmptyState";
import { StatusBadge } from "@/platform/ui/StatusBadge";
import { ToolIcon } from "@/platform/ui/ToolIcon";

export default async function PortalHome() {
  const user = await requireUser();
  const tools = toolsForUser(user);
  const firstName = user.name.split(" ")[0];
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as <span className="font-mono text-xs">{user.roles.join(", ")}</span>. You see the tools your groups give you access to.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Your tools</h2>
        {tools.length === 0 ? (
          <EmptyState
            icon={<Boxes />}
            title="No tools available to you yet"
            description="Tools appear here as they're added to Keystone and your role is granted access. Engineers add one with npm run new-tool."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((t) => (
              <Link
                key={t.slug}
                href={t.nav[0]?.href ?? `/tools/${t.slug}`}
                className="group rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
              >
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <ToolIcon name={t.icon} className="size-4" />
                  </div>
                  <p className="text-sm font-medium">{t.name}</p>
                  {t.sensitivity !== "internal" && <StatusBadge status={t.sensitivity} tone={t.sensitivity === "money" ? "warning" : "info"} className="ml-auto" />}
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{t.description}</p>
                <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                  {t.ownerTeam}
                  <ArrowRight className="ml-auto size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Waiting on you</h2>
          <EmptyState icon={<Inbox />} title="Nothing waiting on you" description="Approvals and tasks assigned to you will show up here." />
        </section>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Your requests</h2>
          <EmptyState icon={<Send />} title="No requests yet" description="Requests you make, like refunds or tool changes, and their status will show up here." />
        </section>
      </div>
    </div>
  );
}
