"use client";

import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { SeasonPickerState } from "@/lib/requests/seasons";
import { SEASON_PILL_LABELS, allPicked, seasonPill, toggleAllSeasons, type SeasonPill } from "@/lib/requests/season-picker";
import { useT } from "@/lib/i18n/client";

export type SeasonPickerRow = {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  state: SeasonPickerState;
};

const PILL_CLASS: Record<SeasonPill, string> = {
  notRequested: "border border-border text-text-muted",
  requested: "bg-info-bg text-info",
  available: "bg-owned-bg text-owned",
  monitored: "bg-downloading-bg text-downloading",
  unavailable: "border border-border text-text-muted",
};

/** A switch, the way Seerr draws them: a small pill with a sliding knob. */
function Switch({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      // The row toggles on a click too; this click is the switch's alone.
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? "bg-accent" : "bg-text-primary/20"}`}
    >
      <span
        aria-hidden
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${checked ? "left-[18px]" : "left-0.5"}`}
      />
    </button>
  );
}

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
  autoApprove = false,
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
  /** "This request will be approved automatically" (the viewer's
   * auto-approve permission, or the admin). */
  autoApprove?: boolean;
  submitLabel: (count: number, pending: boolean) => string;
  /** Resolves to an error to show, or null once done (the dialog closes). */
  onSubmit: (seasons: number[]) => Promise<string | null>;
  onClose: () => void;
}) {
  const t = useT();
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
  const allSelected = allPicked(selected, requestable);

  useEffect(() => {
    if (!panelRef.current) return;
    const panel = panelRef.current;
    const focusables = () =>
      Array.from(panel.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled)"));
    // Opened by a click or a key, so focus goes into the list: the first
    // season that can be picked, or Cancel when none can.
    (panel.querySelector<HTMLElement>("[role=switch]:not(:disabled)") ?? focusables()[0])?.focus();

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
    setSelected((prev) => toggleAllSeasons(prev, requestable));
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
      className="fixed inset-0 z-[58] flex items-end justify-center p-4 sm:items-center"
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
        </div>

        {autoApprove && (
          <div className="mx-5 mb-2 flex items-start gap-2 rounded-xl border border-info/30 bg-info-bg px-3 py-2 text-[12.5px] text-info">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="mt-0.5 h-4 w-4 shrink-0">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8h.01M11 12h1v4h1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t("title.autoApproveBanner")}
          </div>
        )}

        {extra && <div className="px-5 pb-2">{extra}</div>}

        <div className={`min-h-0 flex-1 overflow-y-auto px-5 pb-2 ${listDisabled ? "opacity-50" : ""}`}>
          <table className="w-full border-separate border-spacing-0 text-left">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-text-muted">
                <th className="w-10 border-b border-[var(--marquee-glass-border)] py-2 pr-2 font-medium">
                  <Switch
                    checked={allSelected}
                    disabled={listDisabled || requestable.length === 0}
                    onChange={toggleAll}
                    label={allSelected ? t("title.clearAll") : t("title.selectAll")}
                  />
                </th>
                <th className="border-b border-[var(--marquee-glass-border)] py-2 font-medium">{t("title.seasonColumn")}</th>
                <th className="border-b border-[var(--marquee-glass-border)] py-2 text-right font-medium">{t("title.episodesColumn")}</th>
                <th className="border-b border-[var(--marquee-glass-border)] py-2 pl-3 text-right font-medium">{t("title.statusColumn")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const pickable = row.state === "requestable";
                const checked = pickable && selected.has(row.seasonNumber);
                const pill = seasonPill(row.state);
                return (
                  <tr
                    key={row.seasonNumber}
                    onClick={pickable && !listDisabled ? () => toggle(row.seasonNumber) : undefined}
                    className={`${pickable ? "cursor-pointer hover:bg-text-primary/[0.06]" : ""} ${checked ? "bg-text-primary/[0.07]" : ""}`}
                  >
                    <td className="border-b border-[var(--marquee-glass-border)] py-2 pr-2">
                      <Switch
                        checked={checked}
                        disabled={!pickable || listDisabled}
                        onChange={() => toggle(row.seasonNumber)}
                        label={row.name}
                      />
                    </td>
                    <td className={`border-b border-[var(--marquee-glass-border)] py-2 text-[14px] ${pickable ? "font-medium text-text-primary" : "text-text-secondary"}`}>
                      <span className="block truncate">{row.name}</span>
                    </td>
                    <td className="border-b border-[var(--marquee-glass-border)] py-2 text-right text-[12.5px] text-text-muted">
                      {row.episodeCount}
                    </td>
                    <td className="border-b border-[var(--marquee-glass-border)] py-2 pl-3 text-right">
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${PILL_CLASS[pill]}`}>
                        {t(SEASON_PILL_LABELS[pill])}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

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
              {t("common.cancel")}
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
