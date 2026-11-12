"use client";

import { useActionState } from "react";
import { searchTitleAction } from "@/app/title/[type]/[id]/actions";
import type { MediaType } from "@/lib/db/schema";
import { useT } from "@/lib/i18n/client";
import { PILL_OUTLINE } from "@/components/pill-styles";

/** The title page's "Search for missing" pill (admin, tracked titles): has
 * Sonarr look for every monitored episode it doesn't have yet — Radarr, the
 * movie — and download what it finds, as Sonarr's and Radarr's own "Search
 * Monitored". No episode list to pick from. */
export function SearchMissingButton({
  mediaType,
  tmdbId,
  tvdbId,
}: {
  mediaType: MediaType;
  tmdbId: number;
  tvdbId: number | null;
}) {
  const t = useT();
  const action = searchTitleAction.bind(null, mediaType, tmdbId, tvdbId);
  const [state, formAction, isSearching] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <button
        type="submit"
        disabled={isSearching}
        className={PILL_OUTLINE}
        title={mediaType === "tv" ? t("title.searchMissingHintTv") : t("title.searchMissingHintMovie")}
      >
        {isSearching
          ? t("title.searching")
          : mediaType === "tv"
            ? t("title.searchMissingTv")
            : t("title.searchMissingMovie")}
      </button>
      {state?.error && <span className="text-xs text-red-400">{state.error}</span>}
      {state?.success && <span className="text-xs text-owned">{t("title.searchQueued")}</span>}
    </form>
  );
}
