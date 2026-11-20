import { redirect } from "next/navigation";
import { connection } from "next/server";
import { demoSignInAction, oidcSignInAction } from "@/platform/auth/actions";
import { getAuthMode } from "@/platform/auth/config";
import { getCurrentUser } from "@/platform/auth/current-user";
import { DEMO_IDENTITIES, UNPROVISIONED_DEMO_IDENTITY, type DemoIdentity } from "@/platform/auth/demo-identities";
import { rolesForGroups } from "@/platform/auth/group-role-map";
import { groupLabel, roleLabel } from "@/platform/ui/labels";
import { envLabel } from "@/platform/ui/AppShell";

function IdentityCard({ identity }: { identity: DemoIdentity }) {
  const roles = rolesForGroups(identity.groups);
  const initials = identity.name.split(" ").map((p) => p[0]).join("");
  const role = roles[0] ? roleLabel(roles[0]) : "No role";
  return (
    <form action={demoSignInAction} className="h-full">
      <input type="hidden" name="username" value={identity.username} />
      <button
        type="submit"
        aria-label={`Sign in as ${identity.username}`}
        className="group flex h-full w-full flex-col rounded-lg border bg-card p-4 text-left shadow-xs transition-all hover:border-primary/40 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials}</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{identity.name}</p>
            <p className="truncate text-xs text-muted-foreground">{identity.username}</p>
          </div>
        </div>
        <p className="mt-3 flex-1 text-sm leading-snug text-muted-foreground">{identity.purpose}</p>
        <div className="mt-4 border-t pt-3">
          <p className={roles[0] ? "text-xs font-medium text-foreground" : "text-xs font-medium text-amber-700"}>{role}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={`IdP group: ${identity.groups.join(", ")}`}>
            Group: {identity.groups.map(groupLabel).join(", ")}
          </p>
        </div>
      </button>
    </form>
  );
}

export default async function SignInPage() {
  await connection();
  const mode = getAuthMode();
  const user = await getCurrentUser();
  if (user) redirect(user.roles.length ? "/" : "/access-not-provisioned");

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
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
            <div className="mt-6 grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {DEMO_IDENTITIES.map((d) => (
                <IdentityCard key={d.username} identity={d} />
              ))}
            </div>
            <div className="mt-8 sm:max-w-[calc(50%-0.375rem)] lg:max-w-[calc(25%-0.5625rem)]">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Edge case</p>
              <IdentityCard identity={UNPROVISIONED_DEMO_IDENTITY} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
