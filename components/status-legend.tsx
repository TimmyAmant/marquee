"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LIBRARY_STATUSES, STATUS_TEXT, statusClasses } from "@/lib/library/status-tone";

/** A small "?" beside a poster grid that explains the status colors: each of
 * the five library states with its swatch and a one-line meaning. */
export function StatusLegend({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  // Right-aligned under the button, unless the row wrapped it to the left
  // edge of a narrow window, where that would push the panel off-screen.
  const [alignLeft, setAlignLeft] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={(event) => {
          setAlignLeft(event.currentTarget.getBoundingClientRect().right < 304);
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="What do the colors mean?"
        title="What do the colors mean?"
        className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
          open
            ? "border-accent text-accent"
            : "border-border text-text-secondary hover:border-border-strong hover:text-text-primary"
        }`}
      >
        ?
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="What the status colors mean"
          className={`absolute top-9 z-50 ${alignLeft ? "left-0" : "right-0"} w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-bg-1 p-3 shadow-xl`}
        >
          <p className="px-1 pb-2 text-xs font-medium text-text-primary">What do the colors mean?</p>
          <ul className="flex flex-col gap-2.5">
            {LIBRARY_STATUSES.map((status) => {
              const tone = statusClasses(status);
              return (
                <li key={status} className="flex items-start gap-2.5 px-1">
                  {/* A mini poster edge: the strip color, or a plain outline
                      for "not in your library", which gets no strip. */}
                  <span
                    aria-hidden
                    className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ${
                      tone.strip ?? "border border-text-muted"
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-text-primary">
                      {STATUS_TEXT[status].name}
                    </span>
                    <span className="block text-[11px] leading-snug text-text-secondary">
                      {STATUS_TEXT[status].meaning}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
