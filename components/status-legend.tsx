"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { LIBRARY_STATUSES, statusColorsNote, statusText, statusClasses } from "@/lib/library/status-tone";
import { useT } from "@/lib/i18n/client";

/** The statuses that wear a color, for the pill's row of swatch dots. */
const SWATCH_STATUSES = LIBRARY_STATUSES.filter((status) => statusClasses(status).strip);

/** Each library state with its swatch, name and one-line meaning — the
 * color key's panel and the help page's "What the colors mean". */
export function StatusColorList({ size = "sm" }: { size?: "sm" | "md" }) {
  const t = useT();
  const md = size === "md";
  return (
    <ul className={`flex flex-col ${md ? "gap-4" : "gap-2.5"}`}>
      {LIBRARY_STATUSES.map((status) => {
        const tone = statusClasses(status);
        return (
          <li key={status} className="flex items-start gap-2.5 px-1">
            {/* A mini poster edge: the strip color, or a plain outline
                for "not in your library", which gets no strip. */}
            <span
              aria-hidden
              className={`${md ? "mt-1 h-3.5 w-3.5" : "mt-0.5 h-3 w-3"} shrink-0 rounded-full ${
                tone.strip ?? "border border-text-muted"
              }`}
            />
            <span className="min-w-0">
              <span className={`block font-medium text-text-primary ${md ? "text-sm" : "text-xs"}`}>
                {statusText(t, status).name}
              </span>
              <span className={`block leading-snug text-text-secondary ${md ? "text-[13px]" : "text-[11px]"}`}>
                {statusText(t, status).meaning}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** A small "Color key" pill beside a poster grid or shelf that explains the
 * status colors. Labeled rather than a bare "?" so it's easy to spot; its
 * dots preview the colors it explains. */
export function StatusLegend({ className = "" }: { className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // Right-aligned under the button, unless the button sits near the left
  // edge (beside a page title, or a narrow window wrapped it there), where
  // that would push the panel off-screen.
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
        title={t("help.colorsQuestion")}
        className={`flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors ${
          open
            ? "border-accent text-accent"
            : "border-border text-text-secondary hover:border-border-strong hover:text-text-primary"
        }`}
      >
        <span aria-hidden className="flex items-center gap-[3px]">
          {SWATCH_STATUSES.map((status) => (
            <span key={status} className={`h-[7px] w-[7px] rounded-full ${statusClasses(status).strip}`} />
          ))}
        </span>
        {t("help.colorKey")}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={t("help.colorsDialogLabel")}
          className={`absolute top-9 z-50 ${alignLeft ? "left-0" : "right-0"} w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-bg-1 p-3 shadow-xl`}
        >
          <p className="px-1 pb-2 text-xs font-medium text-text-primary">{t("help.colorsQuestion")}</p>
          <StatusColorList />
          <p className="mt-3 border-t border-border px-1 pt-2.5 text-[11px] text-text-muted">
            {statusColorsNote(t)}{" "}
            <Link href="/help/colors" className="underline decoration-dotted hover:text-accent">
              {t("help.moreAboutColors")}
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
