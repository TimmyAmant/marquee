"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { requestSeasonsAction } from "@/lib/requests/actions";
import { SeasonPickerDialog, type SeasonPickerRow } from "@/components/season-picker-dialog";
import { AddAdvancedOptions } from "@/components/add-advanced-options";
import type { AddOverrides } from "@/lib/arr/add-options";
import { useT } from "@/lib/i18n/client";
import { showToast } from "@/components/toast";

export type { SeasonPickerRow };

/**
 * A member's Request button for a TV show: opens a list of the show's
 * seasons (same order as the Episodes accordion) to pick which ones to ask
 * for. Seasons already in the library, monitored, or already requested show
 * why they can't be picked instead of a checkbox. Escape, Cancel or a click
 * outside closes it and hands focus back to the button.
 */
export function SeasonRequestPicker({
  tmdbId,
  showName,
  rows,
  triggerLabel,
  advanced = false,
  autoApprove = false,
}: {
  tmdbId: number;
  showName: string;
  rows: SeasonPickerRow[];
  /** "Request" for a show not in the library yet, "Request more seasons" once it is. */
  triggerLabel: string;
  /** Offer the Advanced picks (the advancedRequests permission). */
  advanced?: boolean;
  /** The request will be approved at once (the viewer's permission). */
  autoApprove?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [overrides, setOverrides] = useState<AddOverrides | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  async function submit(seasons: number[]): Promise<string | null> {
    const result = await requestSeasonsAction(tmdbId, seasons, overrides ?? undefined);
    if (result.error) return result.error;
    setOpen(false);
    showToast(t("title.requestedToast", { title: showName }));
    // The pending state comes from the server render, same as the
    // whole-series Request button's after a refresh.
    router.refresh();
    return null;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex h-8 items-center rounded-full bg-accent px-4 text-[13px] font-semibold text-bg-0 transition-colors hover:bg-accent-hover"
      >
        {triggerLabel}
      </button>

      {open && (
        <SeasonPickerDialog
          heading={t("title.requestSeasons")}
          subheading={showName}
          rows={rows}
          autoApprove={autoApprove}
          extra={
            advanced ? (
              <details className="rounded-xl border border-[var(--marquee-glass-border)] px-3 py-2">
                <summary className="cursor-pointer text-[13px] font-medium text-text-primary">{t("title.advancedSection")}</summary>
                <div className="pt-2">
                  <AddAdvancedOptions mediaType="tv" tmdbId={tmdbId} onChange={setOverrides} />
                </div>
              </details>
            ) : undefined
          }
          submitLabel={(count, pending) =>
            pending
              ? t("title.requesting")
              : count === 0
                ? t("title.requestSeasons")
                : t("title.requestSeasonCount", { count })
          }
          onSubmit={submit}
          onClose={close}
        />
      )}
    </>
  );
}
