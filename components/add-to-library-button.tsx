"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { StatusBadge, type LibraryStatus } from "@/components/status-badge";
import { isUnwanted } from "@/lib/library/status-tone";
import { addMovieToRadarr, addSeriesToSonarr } from "@/app/title/[type]/[id]/actions";
import { RequestButton } from "@/components/request-button";
import { AddAdvancedPanel, AdvancedSplitToggle, useAddAdvancedOptions } from "@/components/add-advanced-options";
import { PILL, PILL_ACCENT, PILL_NOTE } from "@/components/pill-styles";
import { SeasonRequestPicker, type SeasonPickerRow } from "@/components/season-request-picker";
import type { MediaType } from "@/lib/db/schema";
import { useT } from "@/lib/i18n/client";
import { offerCollection } from "@/components/collection-prompt";

export function AddToLibraryButton({
  mediaType,
  tmdbId,
  name,
  posterPath,
  status,
  configured,
  isAdmin,
  alreadyRequested,
  otherRequesters,
  seasonPicker,
  inArr = false,
  blocked = null,
  canRequest = true,
  advanced = false,
  autoApprove = false,
  downloadProgress = null,
}: {
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  posterPath: string | null;
  status: LibraryStatus;
  configured: boolean;
  /** Omitted when signed out — no add/request action shown at all. */
  isAdmin?: boolean;
  alreadyRequested?: boolean;
  otherRequesters?: string[];
  /** Sonarr/Radarr already has it (unmonitored, nothing on disk —
   * "tracked_unmonitored"): its Start monitoring button does what Add would. */
  inArr?: boolean;
  /** On the admin's blocklist: a member sees "Requests are closed" instead
   * of Request (lib/requests/blocklist.ts). */
  blocked?: { reason: string | null } | null;
  /** A member may request this type (requestMovies / requestTv). */
  canRequest?: boolean;
  /** A member may pick the server, quality and folder (advancedRequests). */
  advanced?: boolean;
  /** Their requests are approved at once (autoApproveMovies / autoApproveTv). */
  autoApprove?: boolean;
  /** How far its download is (0–100), while it's downloading. */
  downloadProgress?: number | null;
  /** A TV show's seasons for a member's season picker; omitted for movies
   * and admins, who keep the whole-title Request/Add buttons. */
  seasonPicker?: {
    rows: SeasonPickerRow[];
    canRequestSeasons: boolean;
    /** seasonsLabel of the member's pending request, e.g. "Seasons 1–3". */
    requestedSeasonsLabel: string | null;
  };
}) {
  const t = useT();
  const router = useRouter();
  // Not in the library and not on its way (untracked, or in Sonarr/Radarr
  // but not monitored): requests stay open.
  const open = isUnwanted(status);
  const add = mediaType === "movie" ? addMovieToRadarr.bind(null, tmdbId) : addSeriesToSonarr.bind(null, tmdbId);
  // A movie in a collection: offer the rest of it — from the action itself,
  // since the refresh after it can swap this button out.
  const action: typeof add = async (prev, formData) => {
    const result = await add(prev, formData);
    if (result?.success && mediaType === "movie") offerCollection(tmdbId);
    return result;
  };

  const [state, formAction, isPending] = useActionState(action, undefined);
  const pickSeasons = mediaType === "tv" && Boolean(seasonPicker?.canRequestSeasons);
  const showRequest =
    open && !state?.success && isAdmin === false && canRequest && !alreadyRequested && !pickSeasons && !blocked;
  const requestedSeasonsLabel = seasonPicker?.requestedSeasonsLabel ?? null;
  const showAdd = open && isAdmin !== false && configured && !inArr && !state?.success;
  // "Advanced" for the admin's Add and a member's Request: a chevron on the
  // button, its panel on a line of its own at the end of the action row.
  const addAdvanced = useAddAdvancedOptions({ mediaType, tmdbId });
  const requestAdvanced = useAddAdvancedOptions({ mediaType, tmdbId, forRequest: true });
  const arrName = mediaType === "movie" ? "Radarr" : "Sonarr";

  useEffect(() => {
    if (state?.success) {
      // Refresh so sibling server-rendered UI on this page (file details,
      // relink form's admin gating) picks up the new libraryStatus instead
      // of staying on the pre-add "untracked" render until reload.
      router.refresh();
    }
  }, [state?.success, router]);

  // `contents`: every capsule here is an item of the title page's action row
  // (components/title-hero.tsx), so they share its gaps and line up with
  // Play, Report and Share instead of sitting in a box of their own. The
  // primary action comes first, then the library badge; notes and the
  // Advanced panel go to the end of the row (`order-last basis-full`).
  return (
    <div className="contents">
      {showRequest && (
        <RequestButton
          mediaType={mediaType}
          tmdbId={tmdbId}
          title={name}
          posterPath={posterPath}
          formId={`request-${mediaType}-${tmdbId}`}
          autoApprove={autoApprove}
          split={advanced ? <AdvancedSplitToggle state={requestAdvanced} /> : undefined}
        />
      )}

      {/* A member picks seasons for a show whenever any are left to ask
          for — for one already in the library, that's "more seasons". */}
      {isAdmin === false && canRequest && !alreadyRequested && pickSeasons && seasonPicker && !blocked && (
        <SeasonRequestPicker
          tmdbId={tmdbId}
          showName={name}
          rows={seasonPicker.rows}
          triggerLabel={open ? t("common.request") : t("title.requestMore")}
          advanced={advanced}
          autoApprove={autoApprove}
        />
      )}

      {showAdd && (
        <form id={`add-${mediaType}-${tmdbId}`} action={formAction} className="contents">
          <span className="inline-flex shrink-0 items-center">
            <button
              type="submit"
              disabled={isPending}
              className={`${PILL_ACCENT} ${isAdmin === true ? "rounded-r-none pr-3" : ""}`}
            >
              {isPending ? t("title.adding") : t("title.addTo", { app: arrName })}
            </button>
            {isAdmin === true && <AdvancedSplitToggle state={addAdvanced} disabled={isPending} />}
          </span>
        </form>
      )}

      <StatusBadge
        status={state?.success ? "tracked_monitored" : status}
        progress={state?.success ? null : downloadProgress}
      />

      {isAdmin === false && alreadyRequested && (open || requestedSeasonsLabel) && (
        <span className={`${PILL} bg-info-bg px-4 font-medium text-info`}>
          {requestedSeasonsLabel
            ? t("title.requestedSeasonsWaiting", { seasons: requestedSeasonsLabel })
            : t("title.requestedWaiting")}
        </span>
      )}

      {blocked && isAdmin === false && (
        <span className={PILL_NOTE}>
          {blocked.reason
            ? t("title.requestsClosedReason", { reason: blocked.reason })
            : t("title.requestsClosed")}
        </span>
      )}

      {open && isAdmin !== false && !configured && (
        <Link
          href="/settings/services"
          className={`${PILL_NOTE} border-dashed hover:border-accent hover:text-accent`}
        >
          {t("title.connectToAdd", { app: arrName })}
        </Link>
      )}

      {showAdd && isAdmin === true && addAdvanced.open && (
        <div className="order-last basis-full">
          <AddAdvancedPanel state={addAdvanced} formId={`add-${mediaType}-${tmdbId}`} />
        </div>
      )}

      {showRequest && advanced && requestAdvanced.open && (
        <div className="order-last basis-full">
          <AddAdvancedPanel state={requestAdvanced} formId={`request-${mediaType}-${tmdbId}`} />
        </div>
      )}

      {open && isAdmin === false && !alreadyRequested && otherRequesters && otherRequesters.length > 0 && (
        <p className="order-last basis-full text-xs text-text-muted">
          {t("title.alsoRequestedBy", { names: new Intl.ListFormat(t.tag).format(otherRequesters) })}
        </p>
      )}

      {state?.error && <p className="order-last basis-full text-xs text-red-400">{state.error}</p>}
    </div>
  );
}
