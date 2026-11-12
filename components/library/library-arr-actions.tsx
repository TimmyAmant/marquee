"use client";

import { useActionState, useState } from "react";
import { searchTitleAction, setTitleMonitoredAction } from "@/app/title/[type]/[id]/actions";
import type { MediaType } from "@/lib/db/schema";
import { useT } from "@/lib/i18n/client";

/**
 * The admin's Sonarr/Radarr actions on a library row — the title page's
 * ArrTrackingControls, in a size that fits a table cell or a poster's
 * hover strip. Same server actions, same admin check.
 */
export function LibraryArrActions({
  mediaType,
  tmdbId,
  tvdbId,
  monitored,
  compact = false,
}: {
  mediaType: MediaType;
  tmdbId: number;
  tvdbId: number | null;
  monitored: boolean;
  /** On a poster: stacked, full width. */
  compact?: boolean;
}) {
  const t = useT();
  // The flag as this browser last set it, so the button flips without a
  // full reload.
  const [current, setCurrent] = useState(monitored);
  const searchAction = searchTitleAction.bind(null, mediaType, tmdbId, tvdbId);
  const [searchState, searchFormAction, isSearching] = useActionState(searchAction, undefined);
  const [toggleState, toggleFormAction, isToggling] = useActionState(
    async (prev: { error?: string; success?: boolean } | undefined, formData: FormData) => {
      const result = await setTitleMonitoredAction(mediaType, tmdbId, tvdbId, !current, prev, formData);
      if (result.success) setCurrent((was) => !was);
      return result;
    },
    undefined,
  );

  const button = compact
    ? "w-full rounded-full border border-border-strong bg-bg-0/95 px-2 py-1 text-[10px] font-medium text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
    : "flex h-7 items-center rounded-full border border-border-strong px-3 text-[12px] text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60";

  return (
    <div className="flex flex-col gap-1">
      <div className={compact ? "flex flex-col gap-1" : "flex flex-wrap items-center gap-1.5"}>
        <form action={searchFormAction}>
          <button type="submit" disabled={isSearching} className={button}>
            {isSearching ? t("title.searching") : searchState?.success ? t("title.searchQueued") : t("title.searchNow")}
          </button>
        </form>
        <form action={toggleFormAction}>
          <button type="submit" disabled={isToggling} className={button}>
            {isToggling ? t("title.updating") : current ? t("title.stopMonitoring") : t("title.startMonitoring")}
          </button>
        </form>
      </div>
      {(searchState?.error || toggleState?.error) && (
        <p className="text-[10px] text-red-400">{searchState?.error ?? toggleState?.error}</p>
      )}
    </div>
  );
}
