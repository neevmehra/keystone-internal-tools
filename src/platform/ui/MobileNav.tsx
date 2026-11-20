"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SidebarNav, type NavItem } from "./SidebarNav";

const noop = () => () => {};
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

/**
 * Below the md breakpoint the sidebar is hidden, so this renders a menu
 * button that opens the same navigation in a slide-over drawer. Closes on
 * navigation, Escape and backdrop click; locks page scroll and keeps focus
 * inside while open.
 */
export function MobileNav({ brand, main, tools, platform }: { brand: ReactNode; main: NavItem[]; tools: NavItem[]; platform: NavItem[] }) {
  const pathname = usePathname();
  const mounted = useMounted();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close when the route changes (a nav link was followed).
  if (open && pathname !== openedAt) {
    setOpen(false);
  }

  const show = () => {
    setOpenedAt(pathname);
    setOpen(true);
  };
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("button[data-close]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && panelRef.current) {
        const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const drawer = (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-foreground/30 animate-in fade-in-0" onClick={close} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r bg-sidebar shadow-xl animate-in slide-in-from-left duration-200"
      >
        <div className="flex h-14 items-center gap-2 border-b px-4">
          {brand}
          <button
            type="button"
            data-close
            onClick={close}
            aria-label="Close menu"
            className="ml-auto flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <SidebarNav main={main} tools={tools} platform={platform} />
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={show}
        aria-label="Open menu"
        aria-expanded={open}
        className="-ml-2 flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:hidden"
      >
        <Menu className="size-5" />
      </button>
      {open && mounted && createPortal(drawer, document.body)}
    </>
  );
}
