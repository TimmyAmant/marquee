"use client";

import Link from "next/link";
import { useActionState } from "react";
import { StatusBadge, type LibraryStatus } from "@/components/status-badge";
import { ResolutionBadge } from "@/components/resolution-badge";
import { addMovieToRadarr, addSeriesToSonarr } from "@/app/title/[type]/[id]/actions";
import { RequestButton } from "@/components/request-button";
import { formatBytes } from "@/lib/format";
import type { MediaType } from "@/lib/db/schema";

export function AddToLibraryButton({
  mediaType,
  tmdbId,
  name,
  posterPath,
  status,
  configured,
  file,
  isAdmin,
  alreadyRequested,
  otherRequesters,
}: {
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  posterPath: string | null;
  status: LibraryStatus;
  configured: boolean;
  file: { path: string | null; sizeBytes: number; quality?: string } | null;
  /** Omitted when signed out — no add/request action shown at all. */
  isAdmin?: boolean;
  alreadyRequested?: boolean;
  otherRequesters?: string[];
}) {
  const action =
    mediaType === "movie" ? addMovieToRadarr.bind(null, tmdbId) : addSeriesToSonarr.bind(null, tmdbId);

  const [state, formAction, isPending] = useActionState(action, undefined);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={state?.success ? "tracked_monitored" : status} />

        {status === "untracked" && !state?.success && isAdmin === false && !alreadyRequested && (
          <RequestButton mediaType={mediaType} tmdbId={tmdbId} title={name} posterPath={posterPath} />
        )}

        {status === "untracked" && isAdmin === false && alreadyRequested && (
          <span className="rounded-full bg-tracked-bg px-4 py-1.5 text-xs font-medium text-tracked">
            Requested — waiting for approval
          </span>
        )}

        {status === "untracked" && isAdmin !== false && configured && !state?.success && (
          <form action={formAction}>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {isPending ? "Adding…" : `Add to ${mediaType === "movie" ? "Radarr" : "Sonarr"}`}
            </button>
          </form>
        )}

        {status === "untracked" && isAdmin !== false && !configured && (
          <Link
            href="/settings/integrations"
            className="text-xs text-text-muted underline decoration-dotted hover:text-accent"
          >
            Connect {mediaType === "movie" ? "Radarr" : "Sonarr"} to add this title
          </Link>
        )}
      </div>

      {status === "untracked" && isAdmin === false && !alreadyRequested && otherRequesters && otherRequesters.length > 0 && (
        <p className="text-xs text-text-muted">Also requested by {otherRequesters.join(", ")}</p>
      )}

      {state?.error && <p className="text-xs text-red-400">{state.error}</p>}

      {file && (
        <p className="flex items-center gap-1.5 text-xs text-text-muted">
          <span>{[file.path, formatBytes(file.sizeBytes), file.quality].filter(Boolean).join(" · ")}</span>
          <ResolutionBadge qualityName={file.quality} />
        </p>
      )}
    </div>
  );
}
