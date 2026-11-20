import { requirePagePermission } from "@/platform/auth";
import { hasPermission } from "@/platform/rbac";
import { PageHeader } from "@/platform/ui/PageHeader";
import { AdminNav } from "./AdminNav";
import { ADMIN_SECTIONS } from "./sections";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePagePermission("admin:read");
  const items = [{ href: "/admin", label: "Overview" }, ...ADMIN_SECTIONS.filter((s) => hasPermission(user, s.permission))];
  return (
    <div>
      <PageHeader title="Admin" description="Governance for every tool on Keystone: access, reviews and audit evidence. Read-only views are generated from code." />
      <AdminNav items={items} />
      {children}
    </div>
  );
}
