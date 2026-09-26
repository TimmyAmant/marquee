"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { StatusBadge, type LibraryStatus } from "@/components/status-badge";
import { isUnwanted } from "@/lib/library/status-tone";
import { addMovieToRadarr, addSeriesToSonarr } from "@/app/title/[type]/[id]/actions";
import { RequestButton } from "@/components/request-button";
import { AddAdvancedOptions } from "@/components/add-advanced-options";
import { SeasonRequestPicker, type SeasonPickerRow } from "@/components/season-request-picker";
import type { MediaType } from "@/lib/db/schema";

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
  /** A TV show's seasons for a member's season picker; omitted for movies
   * and admins, who keep the whole-title Request/Add buttons. */
  seasonPicker?: {
    rows: SeasonPickerRow[];
    canRequestSeasons: boolean;
    /** seasonsLabel of the member's pending request, e.g. "Seasons 1–3". */
    requestedSeasonsLabel: string | null;
  };
}) {
  const router = useRouter();
  // Not in the library and not on its way (untracked, or in Sonarr/Radarr
  // but not monitored): requests stay open.
  const open = isUnwanted(status);
  const action =
    mediaType === "movie" ? addMovieToRadarr.bind(null, tmdbId) : addSeriesToSonarr.bind(null, tmdbId);

  const [state, formAction, isPending] = useActionState(action, undefined);
  const pickSeasons = mediaType === "tv" && Boolean(seasonPicker?.canRequestSeasons);
  const showRequest =
    open && !state?.success && isAdmin === false && canRequest && !alreadyRequested && !pickSeasons && !blocked;
  const requestedSeasonsLabel = seasonPicker?.requestedSeasonsLabel ?? null;

  useEffect(() => {
    if (state?.success) {
      // Refresh so sibling server-rendered UI on this page (file details,
      // relink form's admin gating) picks up the new libraryStatus instead
      // of staying on the pre-add "untracked" render until reload.
      router.refresh();
    }
  }, [state?.success, router]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={state?.success ? "tracked_monitored" : status} />

        {blocked && isAdmin === false && (
          <span className="flex h-8 items-center rounded-full border border-border px-3.5 text-[13px] text-text-secondary">
            Requests are closed for this title{blocked.reason ? ` — ${blocked.reason}` : ""}
          </span>
        )}

        {showRequest && (
          <RequestButton
            mediaType={mediaType}
            tmdbId={tmdbId}
            title={name}
            posterPath={posterPath}
            formId={`request-${mediaType}-${tmdbId}`}
          />
        )}

        {/* A member picks seasons for a show whenever any are left to ask
            for — for one already in the library, that's "more seasons". */}
        {isAdmin === false && canRequest && !alreadyRequested && pickSeasons && seasonPicker && !blocked && (
          <SeasonRequestPicker
            tmdbId={tmdbId}
            showName={name}
            rows={seasonPicker.rows}
            triggerLabel={open ? "Request" : "Request more seasons"}
            advanced={advanced}
          />
        )}

        {isAdmin === false && alreadyRequested && (open || requestedSeasonsLabel) && (
          <span className="flex h-8 items-center rounded-full bg-info-bg px-4 text-[13px] font-medium text-info">
            {requestedSeasonsLabel
              ? `Requested ${requestedSeasonsLabel} — waiting for approval`
              : "Requested — waiting for approval"}
          </span>
        )}

        {open && isAdmin !== false && configured && !inArr && !state?.success && (
          <form id={`add-${mediaType}-${tmdbId}`} action={formAction}>
            <button
              type="submit"
              disabled={isPending}
              className="flex h-8 items-center rounded-full bg-accent px-4 text-[13px] font-semibold text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {isPending ? "Adding…" : `Add to ${mediaType === "movie" ? "Radarr" : "Sonarr"}`}
            </button>
          </form>
        )}

        {open && isAdmin !== false && !configured && (
          <Link
            href="/settings/integrations"
            className="text-xs text-text-muted underline decoration-dotted hover:text-accent"
          >
            Connect {mediaType === "movie" ? "Radarr" : "Sonarr"} to add this title
          </Link>
        )}
      </div>

      {open && isAdmin === true && configured && !inArr && !state?.success && (
        <AddAdvancedOptions
          mediaType={mediaType}
          tmdbId={tmdbId}
          formId={`add-${mediaType}-${tmdbId}`}
          disabled={isPending}
        />
      )}

      {showRequest && advanced && (
        <AddAdvancedOptions mediaType={mediaType} tmdbId={tmdbId} formId={`request-${mediaType}-${tmdbId}`} />
      )}

      {open && isAdmin === false && !alreadyRequested && otherRequesters && otherRequesters.length > 0 && (
        <p className="text-xs text-text-muted">Also requested by {otherRequesters.join(", ")}</p>
      )}

      {state?.error && <p className="text-xs text-red-400">{state.error}</p>}
    </div>
  );
}
