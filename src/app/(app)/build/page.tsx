import { ListChecks, TrendingUp } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { requirePagePermission } from "@/platform/auth";
import { GROUP_ROLE_MAP } from "@/platform/auth/group-role-map";
import { getDevinConfig, isLiveMode } from "@/platform/requests/devin";
import { PageHeader } from "@/platform/ui/PageHeader";
import { StatusBadge } from "@/platform/ui/StatusBadge";
import { tools } from "@/tools";
import { RequestForm } from "./request-form";

export default async function BuildPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePagePermission("requests:create");
  const sp = await searchParams;
  const live = isLiveMode(getDevinConfig());
  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Build with Devin <StatusBadge status={live ? "live" : "simulation"} tone={live ? "success" : "info"} />
          </span>
        }
        description="Ask for a new internal tool, or a change to one, in plain language. An admin approves it, Devin builds it, and an engineer reviews it before it goes live."
        actions={
          <>
            {user.permissions.includes("admin:read") && (
              <Link href="/build/impact" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <TrendingUp /> Impact
              </Link>
            )}
            <Link href="/build/requests" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ListChecks /> {user.permissions.includes("admin:read") ? "All requests" : "My requests"}
            </Link>
          </>
        }
      />
      <RequestForm
        tools={tools.map((t) => ({ slug: t.slug, name: t.name, description: t.description }))}
        groups={Object.keys(GROUP_ROLE_MAP)}
        requester={{ name: user.name, groups: [...user.groups] }}
        mode={live ? "live" : "simulation"}
        initialKind={sp.tab === "change" ? "change_tool" : "new_tool"}
      />
    </div>
  );
}
