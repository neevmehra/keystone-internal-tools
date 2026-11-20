"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ActionFormField = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "number" | "money" | "select" | "email";
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  hint?: string;
};

type Result = { ok: true } | { ok: false; error: { message: string; issues?: Array<{ path: string; message: string }> } };

/**
 * Form for a defineAction export. Money fields are entered in dollars and
 * sent as integer cents. Every submit ends in a toast.
 */
export function ActionForm({
  action,
  fields,
  hidden = {},
  submitLabel = "Save",
  successMessage = "Saved",
  variant = "default",
}: {
  action: (input: Record<string, unknown>) => Promise<Result>;
  fields: ActionFormField[];
  hidden?: Record<string, string | number>;
  submitLabel?: string;
  successMessage?: string;
  variant?: "default" | "destructive" | "outline";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const input: Record<string, unknown> = { ...hidden };
    for (const f of fields) {
      const raw = String(data.get(f.name) ?? "").trim();
      if (raw === "" && !f.required) continue;
      input[f.name] = f.type === "money" ? Math.round(Number(raw) * 100) : f.type === "number" ? Number(raw) : raw;
    }
    startTransition(async () => {
      const res = await action(input);
      if (res.ok) {
        setErrors({});
        toast.success(successMessage);
        router.refresh();
      } else {
        setErrors(Object.fromEntries((res.error.issues ?? []).map((i) => [i.path, i.message])));
        toast.error(res.error.message);
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {fields.map((f) => (
        <div key={f.name} className="space-y-1">
          <Label htmlFor={f.name} className="text-xs">
            {f.label}
            {f.required && <span className="text-destructive">*</span>}
          </Label>
          {f.type === "textarea" ? (
            <Textarea id={f.name} name={f.name} required={f.required} placeholder={f.placeholder} defaultValue={f.defaultValue} />
          ) : f.type === "select" ? (
            <select
              id={f.name}
              name={f.name}
              required={f.required}
              defaultValue={f.defaultValue ?? ""}
              className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
            >
              <option value="" disabled>
                Select…
              </option>
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <Input
              id={f.name}
              name={f.name}
              required={f.required}
              placeholder={f.placeholder}
              defaultValue={f.defaultValue}
              type={f.type === "money" || f.type === "number" ? "number" : f.type === "email" ? "email" : "text"}
              step={f.type === "money" ? "0.01" : undefined}
              min={f.type === "money" ? "0" : undefined}
            />
          )}
          {errors[f.name] ? (
            <p className="text-xs text-destructive">{errors[f.name]}</p>
          ) : (
            f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>
          )}
        </div>
      ))}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "Working…" : submitLabel}
      </Button>
    </form>
  );
}
