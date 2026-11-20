"use client";

import { Banknote, Check, Eye, ShieldAlert, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { submitToolRequestAction } from "@/platform/requests/actions";
import { buildDevinPrompt, type RequestKind } from "@/platform/requests/prompt";
import { groupLabel } from "@/platform/ui/labels";
import { CopyButton } from "./copy-button";

type ToolOption = { slug: string; name: string; description: string };

const num = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));

function Field({ label, hint, error, required, children }: { label: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function RequestForm({
  tools,
  groups,
  requester,
  mode,
  initialKind = "new_tool",
}: {
  tools: ToolOption[];
  groups: string[];
  requester: { name: string; groups: string[] };
  mode: "live" | "simulation";
  initialKind?: RequestKind;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [kind, setKind] = useState<RequestKind>(tools.length === 0 ? "new_tool" : initialKind);
  const [title, setTitle] = useState("");
  const [toolSlug, setToolSlug] = useState("");
  const [problem, setProblem] = useState("");
  const [audience, setAudience] = useState<string[]>([]);
  const [workflow, setWorkflow] = useState("");
  const [signOff, setSignOff] = useState("");
  const [signOffAbove, setSignOffAbove] = useState("");
  const [involvesPii, setInvolvesPii] = useState(false);
  const [movesMoney, setMovesMoney] = useState(false);
  const [peopleCount, setPeopleCount] = useState("");
  const [hoursPerWeek, setHoursPerWeek] = useState("");

  const isChange = kind === "change_tool";
  const tool = tools.find((t) => t.slug === toolSlug);
  const above = num(signOffAbove);
  const input = {
    kind,
    title,
    toolSlug: isChange ? toolSlug || undefined : undefined,
    problem,
    audienceGroups: audience,
    workflow,
    signOff: signOff || undefined,
    signOffAboveCents: above === undefined ? undefined : Math.round(above * 100),
    involvesPii,
    movesMoney,
    peopleCount: num(peopleCount),
    hoursPerWeek: num(hoursPerWeek),
  };
  const preview = useMemo(
    () => buildDevinPrompt({ ...input, toolName: tool?.name ?? null }, requester),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, title, toolSlug, problem, audience, workflow, signOff, signOffAbove, involvesPii, movesMoney, peopleCount, hoursPerWeek, tool, requester],
  );

  const toggleGroup = (g: string) => setAudience((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await submitToolRequestAction(input);
      if (res.ok) {
        setErrors({});
        toast.success("Request submitted. An admin will review it before Devin starts.");
        router.push(`/build/requests/${res.result.id}`);
      } else {
        setErrors(Object.fromEntries((res.error.issues ?? []).map((i) => [i.path, i.message])));
        toast.error(res.error.message);
      }
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <form onSubmit={submit} className="space-y-5 lg:col-span-3">
        <div role="tablist" className="inline-flex rounded-lg border bg-muted/40 p-0.5">
          {(
            [
              ["new_tool", "New tool"],
              ["change_tool", "Change a tool"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "min-h-9 rounded-md px-3.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
                kind === k && "bg-background font-medium text-foreground shadow-sm",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-4 rounded-lg border bg-card p-5">
          {isChange && (
            <Field label="Which tool?" required error={errors.toolSlug}>
              {tools.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  No tools are installed yet. Request a new tool instead.
                </p>
              ) : (
                <select
                  value={toolSlug}
                  onChange={(e) => setToolSlug(e.target.value)}
                  className="h-9 w-full rounded-lg border bg-background px-2.5 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  aria-label="Tool to change"
                >
                  <option value="" disabled>
                    Select a tool…
                  </option>
                  {tools.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}

          <Field label="Name it in a few words" required error={errors.title} hint={isChange ? "e.g. Refunds: CSV export for month-end" : "e.g. Vendor onboarding tracker"}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} aria-label="Title" />
          </Field>

          <Field label={isChange ? "What should change, and why?" : "What problem are you trying to solve?"} required error={errors.problem}>
            <Textarea value={problem} onChange={(e) => setProblem(e.target.value)} className="min-h-20" aria-label="Problem" />
          </Field>

          <Field label="Who will use it?" hint="Pick every team that will open it. Access comes from these identity provider groups.">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Teams">
              {groups.map((g) => {
                const on = audience.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={on}
                    title={g}
                    onClick={() => toggleGroup(g)}
                    className={cn(
                      "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm text-muted-foreground transition-colors",
                      "hover:border-primary/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                      on && "border-primary bg-primary/10 font-medium text-primary hover:text-primary",
                    )}
                  >
                    {on ? <Check className="size-3.5" aria-hidden /> : <span className="size-3.5 rounded-full border border-current opacity-40" aria-hidden />}
                    {groupLabel(g)}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="What do people need to do?" required error={errors.workflow} hint="The steps, in plain language. Who looks at what, and what they decide.">
            <Textarea value={workflow} onChange={(e) => setWorkflow(e.target.value)} className="min-h-20" aria-label="Workflow" />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Does anything need sign-off?" hint="Who signs off on what. Leave empty if nothing.">
              <Input value={signOff} onChange={(e) => setSignOff(e.target.value)} placeholder="e.g. Finance approves write-offs" aria-label="Sign-off" />
            </Field>
            <Field label="Sign-off needed above ($)" error={errors.signOffAboveCents}>
              <Input type="number" min="0" step="0.01" value={signOffAbove} onChange={(e) => setSignOffAbove(e.target.value)} placeholder="500" aria-label="Sign-off threshold" />
            </Field>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium">Sensitivity</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  [involvesPii, setInvolvesPii, ShieldAlert, "Involves customer personal data", "Names, emails, card or account details"],
                  [movesMoney, setMovesMoney, Banknote, "Moves money", "Refunds, payouts, credits or write-offs"],
                ] as const
              ).map(([checked, set, Icon, label, hint]) => (
                <label
                  key={label}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/40",
                    "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                    checked && "border-primary/50 bg-primary/5",
                  )}
                >
                  <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-primary" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <Icon className="size-3.5 text-muted-foreground" aria-hidden /> {label}
                    </span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="How many people deal with this today?" error={errors.peopleCount}>
              <Input type="number" min="1" step="1" value={peopleCount} onChange={(e) => setPeopleCount(e.target.value)} placeholder="4" aria-label="People" />
            </Field>
            <Field label="Roughly how many hours a week, in total?" error={errors.hoursPerWeek} hint="Used to estimate the time this saves.">
              <Input type="number" min="0" step="0.5" value={hoursPerWeek} onChange={(e) => setHoursPerWeek(e.target.value)} placeholder="3" aria-label="Hours per week" />
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Button type="submit" size="lg" disabled={pending} className="sm:self-auto">
            <Sparkles /> {pending ? "Submitting…" : "Submit for approval"}
          </Button>
          <p className="max-w-md text-xs text-muted-foreground">An admin approves the request before Devin starts. An engineer reviews the code before it goes live.</p>
        </div>
      </form>

      <aside className="lg:col-span-2">
        <div className="sticky top-16 rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Eye className="size-4" /> Preview what Devin will receive
            </h2>
            <CopyButton text={preview} />
          </div>
          <pre
            tabIndex={0}
            role="region"
            aria-label="Prompt Devin will receive"
            className="max-h-[32rem] overflow-auto px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground/80 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {preview}
          </pre>
          <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
            {mode === "live"
              ? "Live mode: approval starts a real Devin session on this repo."
              : "Simulation mode: approval shows the exact API request instead of calling Devin."}
          </p>
        </div>
      </aside>
    </div>
  );
}
