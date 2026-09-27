"use client";

import { useActionState } from "react";
import { searchTitleAction, setTitleMonitoredAction } from "@/app/title/[type]/[id]/actions";
import type { MediaType } from "@/lib/db/schema";
import { useT } from "@/lib/i18n/client";
import { MENU_ITEM, PILL_OUTLINE } from "@/components/pill-styles";

/** "Search now" and "Stop / Start monitoring": pills, or two rows of the
 * title page's "…" menu (`variant="menu"`). */
export function ArrTrackingControls({
  mediaType,
  tmdbId,
  tvdbId,
  monitored,
  variant = "pill",
}: {
  mediaType: MediaType;
  tmdbId: number;
  tvdbId: number | null;
  monitored: boolean;
  variant?: "pill" | "menu";
}) {
  const t = useT();
  const searchAction = searchTitleAction.bind(null, mediaType, tmdbId, tvdbId);
  const [searchState, searchFormAction, isSearching] = useActionState(searchAction, undefined);

  const toggleAction = setTitleMonitoredAction.bind(null, mediaType, tmdbId, tvdbId, !monitored);
  const [toggleState, toggleFormAction, isToggling] = useActionState(toggleAction, undefined);

  const menu = variant === "menu";
  const button = menu ? MENU_ITEM : PILL_OUTLINE;
  const note = menu ? "px-3 pb-1 text-xs" : "text-xs";

  return (
    <div className={menu ? "flex flex-col gap-0.5" : "flex flex-col gap-1.5"}>
      <div className={menu ? "flex flex-col gap-0.5" : "flex flex-wrap items-center gap-2"}>
        <form action={searchFormAction}>
          <button type="submit" disabled={isSearching} className={button}>
            {isSearching ? t("title.searching") : t("title.searchNow")}
          </button>
        </form>
        <form action={toggleFormAction}>
          <button type="submit" disabled={isToggling} className={button}>
            {isToggling ? t("title.updating") : monitored ? t("title.stopMonitoring") : t("title.startMonitoring")}
          </button>
        </form>
      </div>
      {searchState?.error && <p className={`${note} text-red-400`}>{searchState.error}</p>}
      {searchState?.success && <p className={`${note} text-owned`}>{t("title.searchQueued")}</p>}
      {toggleState?.error && <p className={`${note} text-red-400`}>{toggleState.error}</p>}
    </div>
  );
}
