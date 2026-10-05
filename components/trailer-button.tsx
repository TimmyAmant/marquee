"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n/client";

/**
 * "Trailer" on a title page: the YouTube trailer in a modal dialog, like
 * the season picker's (components/season-picker-dialog.tsx). Focus goes to
 * its close button and Tab stays inside it; Escape, the close button or a
 * click outside closes it, and focus goes back to the Trailer button.
 */
export function TrailerButton({ videoKey }: { videoKey: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);


  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex h-[30px] items-center gap-1.5 rounded-[15px] border border-border-strong pl-[11px] pr-[13px] text-[12.5px] text-text-primary transition-colors hover:border-accent hover:text-accent"
      >
        <span className="text-accent" aria-hidden>
          ▶
        </span>{" "}
        {t("title.trailer")}
      </button>

      {open && <TrailerDialog videoKey={videoKey} returnFocusTo={buttonRef} onClose={() => setOpen(false)} />}
    </>
  );
}

function TrailerDialog({
  videoKey,
  returnFocusTo,
  onClose,
}: {
  videoKey: string;
  returnFocusTo: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    closeRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      // Tab goes between the close button and the player, never out to the
      // page behind.
      const items = Array.from(panel.querySelectorAll<HTMLElement>("button, iframe"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    // Tabbing out of the player happens inside YouTube's frame, where the
    // keys above never arrive: wherever focus lands outside the dialog then,
    // it's brought back to the close button.
    function handleFocusIn(e: FocusEvent) {
      if (panel && !panel.contains(e.target as Node)) closeRef.current?.focus();
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    const trigger = returnFocusTo.current;
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      // Closed: focus goes back to the Trailer button (once the guard above
      // is gone, or it would pull focus straight back in).
      trigger?.focus();
    };
  }, [returnFocusTo]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("title.trailer")}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      <div aria-hidden onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div ref={panelRef} className="relative w-full max-w-3xl overflow-hidden rounded-xl bg-bg-1 shadow-2xl ring-1 ring-border-strong">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t("title.closeTrailer")}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-bg-0/80 text-text-primary transition-colors hover:text-accent"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="aspect-video w-full">
          <iframe
            className="h-full w-full"
            src={`https://www.youtube.com/embed/${encodeURIComponent(videoKey)}?autoplay=1`}
            title={t("title.trailer")}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        {/* Where Tab goes after the player's last control: back round to the
            close button. */}
        <span tabIndex={0} onFocus={() => closeRef.current?.focus()} />
      </div>
    </div>,
    document.body,
  );
}
