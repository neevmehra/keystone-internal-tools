import { Check, Info } from "lucide-react";
import { accessMatrix, groupRoleRows } from "@/platform/admin";
import { requirePagePermission } from "@/platform/auth";
import { db } from "@/platform/db";
import { fromJson } from "@/platform/json";
import { maskRecord } from "@/platform/rbac/mask";
import { RelativeTime } from "@/platform/ui/RelativeTime";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RoleChips } from "../RoleChips";

export default async function AccessPage() {
  const viewer = await requirePagePermission("admin:read");
  const matrix = accessMatrix();
  const groups = groupRoleRows();
  const users = await db.user.findMany({ orderBy: [{ lastLoginAt: "desc" }, { name: "asc" }] });

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          Access is managed in your identity provider and in code. Changes go through pull request review. This page is read-only and is
          generated from <span className="font-mono text-xs">permissions.ts</span> and <span className="font-mono text-xs">group-role-map.ts</span>.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Access matrix</h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="sticky left-0 bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">Role</th>
                {matrix.permissions.map((p) => (
                  <th key={p} className="px-2 py-2 text-center align-bottom">
                    <span className="inline-block font-mono text-[11px] font-normal whitespace-nowrap text-muted-foreground [writing-mode:vertical-rl] rotate-180">
                      {p}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.roles.map((role) => (
                <tr key={role} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="sticky left-0 bg-card px-3 py-2 font-mono text-xs whitespace-nowrap">{role}</td>
                  {matrix.permissions.map((p) => (
                    <td key={p} className="px-2 py-2 text-center" data-granted={matrix.grants[role].has(p) || undefined}>
                      {matrix.grants[role].has(p) ? (
                        <Check className="mx-auto size-4 text-emerald-600" aria-label={`${role} has ${p}`} />
                      ) : (
                        <span className="text-muted-foreground/40">·</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Identity provider groups</h2>
        <p className="text-sm text-muted-foreground">People get a role only through IdP group membership. Groups not listed here grant nothing.</p>
        <div className="max-w-xl overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IdP group</TableHead>
                <TableHead>App role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <TableRow key={g.group}>
                  <TableCell className="font-mono text-xs">{g.group}</TableCell>
                  <TableCell><RoleChips roles={[g.role]} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Users ({users.length})</h2>
        <p className="text-sm text-muted-foreground">Everyone who has signed in. Roles are recomputed from groups at every sign-in.</p>
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>IdP groups</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Last sign-in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const { email } = maskRecord({ email: u.email }, ["email"], viewer);
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{email}</p>
                    </TableCell>
                    <TableCell><RoleChips roles={fromJson<string[]>(u.groups, [])} empty="No groups" /></TableCell>
                    <TableCell><RoleChips roles={fromJson<string[]>(u.roles, [])} empty="No role" /></TableCell>
                    <TableCell className="text-sm">{u.lastLoginAt ? <RelativeTime date={u.lastLoginAt} /> : <span className="text-muted-foreground">Never</span>}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
