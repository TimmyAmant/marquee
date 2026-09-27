"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";

/**
 * The title page's "…" capsule: the rarely used tools (Search now, Stop
 * monitoring, Block requests, Fix ID) in a menu instead of a second and third
 * row of pills. The menu is only hidden while closed, never unmounted, so a
 * half-typed Fix ID or a "Search queued" message is still there when it's
 * opened again.
 */
export function TitleMoreMenu({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // Which way the menu opens: from the button's left edge unless that would
  // run past the window's right edge (the button ends a wrapped row).
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setAlignRight(rect.left + 300 > window.innerWidth - 16);
    setOpen((v) => !v);
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t("title.moreActions")}
        title={t("title.moreActions")}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-bg-0/40 backdrop-blur-md transition-colors ${
          open
            ? "border-accent text-accent"
            : "border-border-strong text-text-primary hover:border-accent hover:text-accent"
        }`}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-4 w-4">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      <div
        className={`nav-glass absolute top-full z-30 mt-1.5 w-[300px] max-w-[calc(100vw-2rem)] flex-col gap-0.5 rounded-xl p-1.5 ${
          alignRight ? "right-0" : "left-0"
        } ${open ? "flex" : "hidden"}`}
      >
        {children}
      </div>
    </div>
  );
}
