import { redirect } from "next/navigation";
import { demoSignInAction, oidcSignInAction } from "@/platform/auth/actions";
import { getAuthMode } from "@/platform/auth/config";
import { getCurrentUser } from "@/platform/auth/current-user";
import { DEMO_IDENTITIES, UNPROVISIONED_DEMO_IDENTITY, type DemoIdentity } from "@/platform/auth/demo-identities";
import { rolesForGroups } from "@/platform/auth/group-role-map";
import { envLabel } from "@/platform/ui/AppShell";

function IdentityCard({ identity }: { identity: DemoIdentity }) {
  const roles = rolesForGroups(identity.groups);
  const initials = identity.name.split(" ").map((p) => p[0]).join("");
  return (
    <form action={demoSignInAction}>
      <input type="hidden" name="username" value={identity.username} />
      <button
        type="submit"
        aria-label={`Sign in as ${identity.username}`}
        className="group flex h-full w-full flex-col rounded-lg border bg-card p-3.5 text-left transition-all hover:border-primary/50 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials}</div>
          <div className="min-w-0">
            <p className="text-sm font-medium">{identity.username}</p>
            <p className="truncate text-xs text-muted-foreground">{identity.name}</p>
          </div>
        </div>
        <p className="mt-2.5 flex-1 text-xs text-muted-foreground">{identity.purpose}</p>
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {identity.groups.map((g) => (
            <span key={g} className="rounded-md border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px]">
              {g}
            </span>
          ))}
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">{roles[0] ?? "no role"}</span>
        </div>
      </button>
    </form>
  );
}

export default async function SignInPage() {
  const mode = getAuthMode();
  const user = await getCurrentUser();
  if (user) redirect(user.roles.length ? "/" : "/access-not-provisioned");

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-4xl px-6 py-14">
        <div className="mb-8 flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">K</div>
          <span className="font-semibold tracking-tight">Keystone</span>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-800 ring-1 ring-amber-300 ring-inset">{envLabel()}</span>
        </div>
        {mode === "oidc" ? (
          <div className="max-w-sm rounded-lg border bg-card p-6">
            <h1 className="text-lg font-semibold">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">Use your company account.</p>
            <form action={oidcSignInAction} className="mt-5">
              <button type="submit" className="h-9 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Continue with company SSO
              </button>
            </form>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Demo sign-in</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Pick an identity. Each one carries IdP groups, which map to an app role and its permissions, just like company SSO.
              Fake people, fake data.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {DEMO_IDENTITIES.map((d) => (
                <IdentityCard key={d.username} identity={d} />
              ))}
            </div>
            <div className="mt-8 max-w-xs">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Edge case</p>
              <IdentityCard identity={UNPROVISIONED_DEMO_IDENTITY} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
