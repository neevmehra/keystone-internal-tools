"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CustomerSearchResult } from "@/platform/manifest";
import { cn } from "@/lib/utils";

type Outcome = { results: CustomerSearchResult[]; piiSearchBlocked: boolean };

/**
 * Global search palette (Cmd+K / Ctrl+K). Results come from /api/search,
 * which applies the same permission and masking rules as the /search page.
 */
export function CommandSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ results: [], piiSearchBlocked: false });
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setOutcome({ results: [], piiSearchBlocked: false });
    setActive(0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (res.ok) {
          setOutcome((await res.json()) as Outcome);
          setActive(0);
        }
      } catch {
        // Aborted or offline: keep the previous results.
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const go = (href: string) => {
    close();
    router.push(href);
  };

  const shown = query.trim().length >= 3 ? outcome.results : [];
  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") close();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(shown.length - 1, 0)));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const target = shown[active];
      go(target ? target.href : `/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-56 items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-xs text-muted-foreground hover:bg-muted"
      >
        <Search className="size-3.5" />
        <span>Search customers and records</span>
        <kbd className="ml-auto rounded border bg-background px-1 font-mono text-[10px]">⌘K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh]" onMouseDown={close}>
          <div
            role="dialog"
            aria-label="Search"
            className="w-full max-w-xl overflow-hidden rounded-lg border bg-popover shadow-lg"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Customer, transaction, refund or dispute ID, or an email"
                className="h-11 flex-1 bg-transparent text-sm outline-none"
              />
              {loading && <span className="text-[11px] text-muted-foreground">Searching…</span>}
            </div>
            <div className="max-h-80 overflow-y-auto py-1">
              {query.trim().length < 3 && <p className="px-3 py-2 text-xs text-muted-foreground">Type at least 3 characters. IDs match from the start.</p>}
              {query.trim().length >= 3 && outcome.piiSearchBlocked && (
                <p className="px-3 py-2 text-xs text-amber-700">Email and name search needs PII access. Try an ID instead.</p>
              )}
              {query.trim().length >= 3 && !loading && shown.length === 0 && !outcome.piiSearchBlocked && (
                <p className="px-3 py-2 text-xs text-muted-foreground">No matches. Press Enter for the full search page.</p>
              )}
              {shown.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r.href)}
                  className={cn("flex w-full items-center gap-3 px-3 py-2 text-left text-sm", i === active && "bg-muted")}
                >
                  <span className="w-20 shrink-0 text-[11px] font-medium text-muted-foreground">{r.type}</span>
                  <span className="font-medium">{r.title}</span>
                  {r.subtitle && <span className="truncate text-xs text-muted-foreground">{r.subtitle}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
