import { Boxes } from "lucide-react";
import Link from "next/link";
import { toolAccess } from "@/platform/admin";
import { requirePagePermission } from "@/platform/auth";
import { EmptyState } from "@/platform/ui/EmptyState";
import { StatusBadge } from "@/platform/ui/StatusBadge";
import { ToolIcon } from "@/platform/ui/ToolIcon";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { tools } from "@/tools";
import { RoleChips } from "../RoleChips";

const SENSITIVITY_TONE = { internal: "neutral", pii: "info", money: "warning" } as const;

export default async function ToolCatalogPage() {
  await requirePagePermission("admin:read");
  if (tools.length === 0) {
    return (
      <EmptyState
        icon={<Boxes />}
        title="No tools yet"
        description="Tools appear here as soon as they're registered. Engineers add one with npm run new-tool, and anyone can ask for one through Build with Devin."
      />
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {tools.length} {tools.length === 1 ? "tool" : "tools"}. Access below is derived from <span className="font-mono text-xs">permissions.ts</span>, the same code that enforces it.
      </p>
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tool</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Sensitivity</TableHead>
              <TableHead>Can read</TableHead>
              <TableHead>Can write</TableHead>
              <TableHead>Can approve</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tools.map((t) => {
              const access = toolAccess(t);
              return (
                <TableRow key={t.slug} className="align-top">
                  <TableCell>
                    <Link href={t.nav[0]?.href ?? `/tools/${t.slug}`} className="flex items-start gap-2 hover:underline">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <ToolIcon name={t.icon} className="size-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium">{t.name}</span>
                        <span className="block max-w-64 text-xs whitespace-normal text-muted-foreground">{t.description}</span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{t.ownerTeam}</TableCell>
                  <TableCell>
                    <StatusBadge status={t.sensitivity} tone={SENSITIVITY_TONE[t.sensitivity]} />
                    {t.piiFields && t.piiFields.length > 0 && (
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">PII: {t.piiFields.join(", ")}</p>
                    )}
                  </TableCell>
                  <TableCell><RoleChips roles={access.read} /></TableCell>
                  <TableCell><RoleChips roles={access.write} /></TableCell>
                  <TableCell><RoleChips roles={access.approve} empty="No approvals" /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
