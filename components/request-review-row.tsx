"use client";

import Link from "next/link";
import Image from "next/image";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { approveRequestAction, rejectRequestAction } from "@/lib/requests/actions";
import { SONARR_UNRESOLVED_ERROR } from "@/lib/requests/errors";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import type { MediaType } from "@/lib/db/schema";

export function RequestReviewRow({
  id,
  mediaType,
  tmdbId,
  title,
  posterPath,
  requestedByName,
  requestedByUsername,
  createdAt,
  sonarrUrl,
}: {
  id: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  requestedByName: string | null;
  requestedByUsername: string;
  createdAt: string;
  /** Admin's connected Sonarr base URL (Settings > Integrations), if any —
   * used to link straight to Sonarr's own "add series" search when Marquee
   * can't resolve this show's TVDB id itself. */
  sonarrUrl: string | null;
}) {
  const router = useRouter();
  const approveAction = approveRequestAction.bind(null, id);
  const rejectAction = rejectRequestAction.bind(null, id);
  const [approveState, approveFormAction, isApproving] = useActionState(approveAction, undefined);
  const [rejectState, rejectFormAction, isRejecting] = useActionState(rejectAction, undefined);

  const src = tmdbImageUrl(posterPath, "w92");
  const done = Boolean(approveState?.success || rejectState?.success);

  useEffect(() => {
    if (done) router.refresh();
  }, [done, router]);

  if (done) return null;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-bg-1 p-3">
      <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-bg-2">
        {src && <Image src={src} alt="" fill sizes="56px" className="object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <Link
          href={`/title/${mediaType}/${tmdbId}`}
          className="text-sm font-medium text-text-primary hover:text-accent"
        >
          {title}
        </Link>
        <p className="mt-0.5 text-xs text-text-secondary">
          Requested by {requestedByName || requestedByUsername} ·{" "}
          {new Date(createdAt).toLocaleDateString()}
        </p>
        {(approveState?.error || rejectState?.error) && (
          <p className="mt-1 text-xs text-red-400">
            {approveState?.error || rejectState?.error}
            {approveState?.error === SONARR_UNRESOLVED_ERROR && sonarrUrl && (
              <>
                {" — "}
                <a
                  href={`${sonarrUrl}/add/new?term=${encodeURIComponent(title)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-text-secondary underline underline-offset-2 hover:text-accent"
                >
                  Add manually in Sonarr
                </a>
              </>
            )}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <form action={rejectFormAction}>
          <button
            type="submit"
            disabled={isApproving || isRejecting}
            className="rounded-full border border-border-strong px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-red-400 hover:text-red-400 disabled:opacity-60"
          >
            {isRejecting ? "Rejecting…" : "Reject"}
          </button>
        </form>
        <form action={approveFormAction}>
          <button
            type="submit"
            disabled={isApproving || isRejecting}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {isApproving ? "Approving…" : "Approve"}
          </button>
        </form>
      </div>
    </div>
  );
}
