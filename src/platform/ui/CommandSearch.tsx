"use client";

import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { CustomerSearchResult } from "@/platform/manifest";
import { cn } from "@/lib/utils";

type Outcome = { results: CustomerSearchResult[]; piiSearchBlocked: boolean };

const noop = () => () => {};
/** True on Apple platforms, so the shortcut hint reads ⌘K there and Ctrl K elsewhere. */
function useIsMac() {
  return useSyncExternalStore(
    noop,
    () => /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent),
    () => false,
  );
}
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

/**
 * Global search palette (Cmd+K / Ctrl+K). Renders a full search trigger on
 * desktop and an icon button on small screens, with one shared shortcut.
 * The dialog is portaled to <body> so the sticky, blurred header can't clip
 * it. Results come from /api/search, which applies the same permission and
 * masking rules as the /search page.
 */
export function CommandSearch() {
  const router = useRouter();
  const isMac = useIsMac();
  const mounted = useMounted();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ results: [], piiSearchBlocked: false });
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const openPalette = useCallback(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setOutcome({ results: [], piiSearchBlocked: false });
    setActive(0);
    returnFocus.current?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) close();
        else openPalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, openPalette]);

  // Focus the input, and lock page scroll while the palette is open.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
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

  const ready = query.trim().length >= 3;
  const shown = ready ? outcome.results : [];

  const onDialogKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    // Keep Tab inside the dialog.
    if (e.key === "Tab" && dialogRef.current) {
      const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("input, button:not([disabled])"));
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
      const q = query.trim();
      if (!q) return;
      const target = shown[active];
      go(target ? target.href : `/search?q=${encodeURIComponent(q)}`);
    }
  };

  const shortcut = isMac ? "⌘K" : "Ctrl K";

  const dialog = (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/25 px-4 pt-[12vh] backdrop-blur-[1px]" onMouseDown={close}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onKeyDown={onDialogKey}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/5"
      >
        <div className="flex items-center gap-2.5 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            role="combobox"
            aria-expanded={shown.length > 0}
            aria-controls="command-search-results"
            aria-activedescendant={shown[active] ? `command-search-${shown[active].id}` : undefined}
            aria-label="Search customers and records"
            placeholder="Search by customer, transaction, refund or dispute ID…"
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading ? (
            <span className="text-xs text-muted-foreground">Searching…</span>
          ) : (
            <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground sm:inline">Esc</kbd>
          )}
        </div>
        <div id="command-search-results" role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-1.5">
          {!ready && (
            <p className="px-2.5 py-3 text-sm text-muted-foreground">
              Type at least 3 characters. IDs match from the start; emails need PII access.
            </p>
          )}
          {ready && outcome.piiSearchBlocked && (
            <p className="px-2.5 py-3 text-sm text-amber-700">Email and name search needs PII access. Try an ID instead.</p>
          )}
          {ready && !loading && shown.length === 0 && !outcome.piiSearchBlocked && (
            <p className="px-2.5 py-3 text-sm text-muted-foreground">No matches. Press Enter to open the full search page.</p>
          )}
          {shown.map((r, i) => (
            <button
              key={r.id}
              id={`command-search-${r.id}`}
              type="button"
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r.href)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm",
                i === active ? "bg-muted text-foreground" : "text-foreground/90",
              )}
            >
              <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">{r.type}</span>
              <span className="truncate font-medium">{r.title}</span>
              {r.subtitle && <span className="hidden truncate text-xs text-muted-foreground sm:inline">{r.subtitle}</span>}
              {i === active && <CornerDownLeft className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
            </button>
          ))}
        </div>
        <div className="hidden items-center gap-3 border-t bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground sm:flex">
          <span>
            <kbd className="font-sans font-medium">↑↓</kbd> to move
          </span>
          <span>
            <kbd className="font-sans font-medium">Enter</kbd> to open
          </span>
          <span className="ml-auto">
            <kbd className="font-sans font-medium">{shortcut}</kbd> anywhere
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: full trigger */}
      <button
        type="button"
        onClick={openPalette}
        aria-label="Search customers and records"
        className="hidden h-8 w-72 items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:flex lg:w-80"
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span>Search…</span>
        <kbd className="ml-auto rounded border bg-background px-1.5 py-px font-sans text-[10px] font-medium text-muted-foreground">{shortcut}</kbd>
      </button>
      {/* Small screens: icon button */}
      <button
        type="button"
        onClick={openPalette}
        aria-label="Search"
        className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:hidden"
      >
        <Search className="size-4" aria-hidden />
      </button>
      {open && mounted && createPortal(dialog, document.body)}
    </>
  );
}
