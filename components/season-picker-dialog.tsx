"use client";

import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { SeasonPickerState } from "@/lib/requests/seasons";

export type SeasonPickerRow = {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  state: SeasonPickerState;
};

const TAGS: Partial<Record<SeasonPickerState, { label: string; className: string }>> = {
  complete: { label: "In library", className: "bg-owned-bg text-owned" },
  monitored: { label: "Monitored", className: "bg-tracked-bg text-tracked" },
  requested: { label: "Requested", className: "bg-tracked-bg text-tracked" },
};

/**
 * The season picker's dialog: a show's seasons (same order as the Episodes
 * accordion) with a checkbox on each one that can be picked, and why not on
 * the rest. Used to ask for seasons (components/season-request-picker.tsx)
 * and to change a pending request's (components/request-lifecycle.tsx).
 * Escape, Cancel or a click outside closes it; the caller hands focus back.
 */
export function SeasonPickerDialog({
  heading,
  subheading,
  rows,
  initialSelected = [],
  extra,
  listDisabled = false,
  allowEmpty = false,
  submitLabel,
  onSubmit,
  onClose,
}: {
  heading: string;
  subheading: string;
  rows: SeasonPickerRow[];
  initialSelected?: number[];
  /** Above the list: e.g. the edit dialog's "Whole series" and 4K choices. */
  extra?: ReactNode;
  /** Greys the list out (a whole-series or 4K choice above makes it moot). */
  listDisabled?: boolean;
  /** Submit may be pressed with nothing ticked (the choice above says what). */
  allowEmpty?: boolean;
  submitLabel: (count: number, pending: boolean) => string;
  /** Resolves to an error to show, or null once done (the dialog closes). */
  onSubmit: (seasons: number[]) => Promise<string | null>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(initialSelected));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const requestable = rows.filter((r) => r.state === "requestable").map((r) => r.seasonNumber);
  const allSelected = requestable.length > 0 && requestable.every((n) => selected.has(n));

  useEffect(() => {
    if (!panelRef.current) return;
    const panel = panelRef.current;
    const focusables = () =>
      Array.from(panel.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled)"));
    // Opened by a click or a key, so focus goes into the list: the first
    // season that can be picked, or Cancel when none can.
    (panel.querySelector<HTMLElement>("input:not(:disabled)") ?? focusables()[0])?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      // Tab stays inside the dialog, as it does in the nav's search panel.
      const items = focusables();
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
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function toggle(seasonNumber: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(seasonNumber)) next.delete(seasonNumber);
      else next.add(seasonNumber);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(requestable));
  }

  function submit() {
    // Only seasons that can still be picked count.
    const seasons = [...selected].filter((n) => requestable.includes(n)).sort((a, b) => a - b);
    setError(null);
    startTransition(async () => {
      const failure = await onSubmit(seasons);
      if (failure) setError(failure);
    });
  }

  const count = [...selected].filter((n) => requestable.includes(n)).length;

  // Portaled to <body> so `fixed` means the viewport: an ancestor in the
  // hero with a backdrop filter or transform would otherwise become the
  // containing block and clip the dialog.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
    >
      <div aria-hidden onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div
        ref={panelRef}
        className="nav-glass relative flex max-h-[min(80vh,640px)] w-full max-w-[440px] flex-col overflow-hidden rounded-[24px] shadow-[0_24px_60px_rgb(0_0_0/0.35)]"
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-[18px] font-semibold leading-6 text-text-primary">
              {heading}
            </h2>
            <p className="mt-0.5 truncate text-[13px] text-text-secondary">{subheading}</p>
          </div>
          {requestable.length > 1 && !listDisabled && (
            <button
              type="button"
              onClick={toggleAll}
              className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium text-accent transition-colors hover:bg-text-primary/10"
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          )}
        </div>

        {extra && <div className="px-5 pb-2">{extra}</div>}

        <ul
          className={`flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-2 ${listDisabled ? "opacity-50" : ""}`}
        >
          {rows.map((row) => {
            const tag = TAGS[row.state];
            const episodes = `${row.episodeCount} episode${row.episodeCount === 1 ? "" : "s"}`;
            if (row.state === "requestable") {
              const checked = selected.has(row.seasonNumber);
              return (
                <li key={row.seasonNumber}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-full px-3 py-2 transition-colors hover:bg-text-primary/10 ${
                      checked && !listDisabled ? "bg-text-primary/[0.07]" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={listDisabled}
                      onChange={() => toggle(row.seasonNumber)}
                      className="h-4 w-4 shrink-0 accent-accent"
                    />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-text-primary">
                      {row.name}
                    </span>
                    <span className="shrink-0 text-[12px] text-text-muted">{episodes}</span>
                  </label>
                </li>
              );
            }
            return (
              <li key={row.seasonNumber} className="flex items-center gap-3 px-3 py-2">
                {/* Keeps the name lined up with the checkbox rows. */}
                <span aria-hidden className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-[14px] text-text-secondary">{row.name}</span>
                <span className="shrink-0 text-[12px] text-text-muted">{episodes}</span>
                {tag && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${tag.className}`}>
                    {tag.label}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        <div className="border-t border-[var(--marquee-glass-border)] px-5 py-3">
          {error && (
            <p role="alert" className="mb-2 text-xs text-red-400">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 items-center rounded-full border border-border-strong px-4 text-[13px] text-text-primary transition-colors hover:border-accent hover:text-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={(count === 0 && !allowEmpty) || isPending}
              className="flex h-8 items-center rounded-full bg-accent px-4 text-[13px] font-semibold text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {submitLabel(count, isPending)}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
