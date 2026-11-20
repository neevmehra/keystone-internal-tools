import { ShieldAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { signOutAction } from "@/platform/auth/actions";
import { getCurrentUser } from "@/platform/auth/current-user";
import { groupLabel } from "@/platform/ui/labels";

export default async function AccessNotProvisioned() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (user.roles.length) redirect("/");
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-6">
        <div className="flex size-9 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <ShieldAlert className="size-4" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">Access not provisioned</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You&apos;re signed in as {user.name} ({user.email}), but none of your groups map to a Keystone role.
        </p>
        <div className="mt-4">
          <p className="text-xs font-medium text-muted-foreground">Your identity provider groups</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {user.groups.length ? (
              user.groups.map((g) => (
                <span key={g} title={`IdP group: ${g}`} className="rounded-md border bg-muted/50 px-1.5 py-0.5 text-xs">
                  {groupLabel(g)} <span className="font-mono text-muted-foreground">({g})</span>
                </span>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">No groups in your identity token.</span>
            )}
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Ask your manager or IT to add you to the right group, then sign in again.</p>
        <form action={signOutAction} className="mt-5">
          <button type="submit" className="h-9 rounded-lg border px-3 text-sm font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
