import { Download, FileText, ShieldCheck } from "lucide-react";
import { requirePagePermission } from "@/platform/auth";
import { db } from "@/platform/db";
import { RelativeTime } from "@/platform/ui/RelativeTime";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FILES: Array<{ name: string; control: string; what: string }> = [
  { name: "access-matrix.csv", control: "Access control", what: "Every role and the permissions it holds, generated from the code that enforces them." },
  { name: "group-role-map.csv", control: "Access control", what: "Which identity-provider group grants which role." },
  { name: "users.csv", control: "Access control", what: "Everyone who has signed in, with groups, roles and last sign-in." },
  { name: "access-review.csv", control: "Access review", what: "The latest completed access review, with every keep or revoke decision." },
  { name: "approvals.csv", control: "Separation of duties", what: "Every approval with requester and decider, plus a requester_is_not_decider column." },
  { name: "audit-events.csv", control: "Monitoring", what: "The full append-only activity log for the period." },
  { name: "README.txt", control: "All", what: "What each file is and the control it supports." },
];

const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function EvidencePage() {
  await requirePagePermission("audit:export");
  const now = new Date();
  const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const recent = await db.auditEvent.findMany({ where: { action: "evidence.export" }, orderBy: { createdAt: "desc" }, take: 5 });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
      <section className="space-y-3">
        <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Audit-ready in one download</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Auditors and sponsor banks ask for the same evidence every cycle. The pack is generated from live data, masked to your permissions, and
              generating it is itself recorded in the audit log.
            </p>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border bg-card">
          <ul className="divide-y">
            {FILES.map((f) => (
              <li key={f.name} className="flex items-start gap-3 px-4 py-3">
                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs font-medium">{f.name}</p>
                  <p className="text-sm text-muted-foreground">{f.what}</p>
                </div>
                <span className="shrink-0 rounded-md border bg-muted/50 px-1.5 py-0.5 text-[11px] text-muted-foreground">{f.control}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <aside className="space-y-4">
        <form action="/admin/evidence/download" method="get" className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">Generate the pack</h2>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="from" className="text-xs">From</Label>
              <Input id="from" name="from" type="date" defaultValue={day(from)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to" className="text-xs">To</Label>
              <Input id="to" name="to" type="date" defaultValue={day(now)} />
            </div>
          </div>
          <button type="submit" className={buttonVariants({ className: "w-full" })}>
            <Download /> Download evidence pack (.zip)
          </button>
        </form>
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">Recent exports</h2>
          {recent.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {recent.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2">
                  <span>{e.actorName}</span>
                  <RelativeTime date={e.createdAt} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
