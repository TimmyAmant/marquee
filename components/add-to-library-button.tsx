"use client";

import Link from "next/link";
import { useActionState } from "react";
import { StatusBadge, type LibraryStatus } from "@/components/status-badge";
import { addMovieToRadarr, addSeriesToSonarr } from "@/app/title/[type]/[id]/actions";
import { formatBytes } from "@/lib/format";

export function AddToLibraryButton({
  mediaType,
  tmdbId,
  status,
  configured,
  file,
}: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  status: LibraryStatus;
  configured: boolean;
  file: { path: string; sizeBytes: number; quality?: string } | null;
}) {
  const action =
    mediaType === "movie" ? addMovieToRadarr.bind(null, tmdbId) : addSeriesToSonarr.bind(null, tmdbId);

  const [state, formAction, isPending] = useActionState(action, undefined);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={state?.success ? "tracked_monitored" : status} />

        {status === "untracked" && configured && !state?.success && (
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

        {status === "untracked" && !configured && (
          <Link
            href="/settings/integrations"
            className="text-xs text-text-muted underline decoration-dotted hover:text-accent"
          >
            Connect {mediaType === "movie" ? "Radarr" : "Sonarr"} to add this title
          </Link>
        )}
      </div>

      {state?.error && <p className="text-xs text-red-400">{state.error}</p>}

      {file && (
        <p className="text-xs text-text-muted">
          {file.path} · {formatBytes(file.sizeBytes)}
          {file.quality ? ` · ${file.quality}` : ""}
        </p>
      )}
    </div>
  );
}
