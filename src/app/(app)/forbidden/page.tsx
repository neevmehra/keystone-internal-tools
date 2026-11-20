import { Lock } from "lucide-react";
import { EmptyState } from "@/platform/ui/EmptyState";

export default async function Forbidden({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { permission } = await searchParams;
  return (
    <EmptyState
      icon={<Lock />}
      title="You don't have access to this page"
      description={
        <>
          It needs the <span className="font-mono text-xs">{String(permission ?? "required")}</span> permission. Access is granted by role, through your IdP groups.
        </>
      }
      action={{ label: "Back to home", href: "/" }}
    />
  );
}
