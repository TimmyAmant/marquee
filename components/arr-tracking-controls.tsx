"use client";

import { useActionState } from "react";
import { searchTitleAction, setTitleMonitoredAction } from "@/app/title/[type]/[id]/actions";
import type { MediaType } from "@/lib/db/schema";
import { useT } from "@/lib/i18n/client";

export function ArrTrackingControls({
  mediaType,
  tmdbId,
  tvdbId,
  monitored,
}: {
  mediaType: MediaType;
  tmdbId: number;
  tvdbId: number | null;
  monitored: boolean;
}) {
  const t = useT();
  const searchAction = searchTitleAction.bind(null, mediaType, tmdbId, tvdbId);
  const [searchState, searchFormAction, isSearching] = useActionState(searchAction, undefined);

  const toggleAction = setTitleMonitoredAction.bind(null, mediaType, tmdbId, tvdbId, !monitored);
  const [toggleState, toggleFormAction, isToggling] = useActionState(toggleAction, undefined);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <form action={searchFormAction}>
          <button
            type="submit"
            disabled={isSearching}
            className="flex h-8 items-center rounded-full border border-border-strong px-3.5 text-[13px] text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {isSearching ? t("title.searching") : t("title.searchNow")}
          </button>
        </form>
        <form action={toggleFormAction}>
          <button
            type="submit"
            disabled={isToggling}
            className="flex h-8 items-center rounded-full border border-border-strong px-3.5 text-[13px] text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {isToggling ? t("title.updating") : monitored ? t("title.stopMonitoring") : t("title.startMonitoring")}
          </button>
        </form>
      </div>
      {searchState?.error && <p className="text-xs text-red-400">{searchState.error}</p>}
      {searchState?.success && <p className="text-xs text-owned">{t("title.searchQueued")}</p>}
      {toggleState?.error && <p className="text-xs text-red-400">{toggleState.error}</p>}
    </div>
  );
}
