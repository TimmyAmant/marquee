"use client";

import { useActionState } from "react";
import { searchTitleAction, setTitleMonitoredAction } from "@/app/title/[type]/[id]/actions";
import type { MediaType } from "@/lib/db/schema";

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
            {isSearching ? "Searching…" : "Search now"}
          </button>
        </form>
        <form action={toggleFormAction}>
          <button
            type="submit"
            disabled={isToggling}
            className="flex h-8 items-center rounded-full border border-border-strong px-3.5 text-[13px] text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {isToggling ? "Updating…" : monitored ? "Stop monitoring" : "Start monitoring"}
          </button>
        </form>
      </div>
      {searchState?.error && <p className="text-xs text-red-400">{searchState.error}</p>}
      {searchState?.success && <p className="text-xs text-owned">Search queued.</p>}
      {toggleState?.error && <p className="text-xs text-red-400">{toggleState.error}</p>}
    </div>
  );
}
