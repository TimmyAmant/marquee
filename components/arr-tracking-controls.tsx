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
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <form action={searchFormAction}>
          <button
            type="submit"
            disabled={isSearching}
            className="rounded-full border border-border-strong px-3 py-1.5 text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {isSearching ? "Searching…" : "Search now"}
          </button>
        </form>
        <form action={toggleFormAction}>
          <button
            type="submit"
            disabled={isToggling}
            className="rounded-full border border-border-strong px-3 py-1.5 text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
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
