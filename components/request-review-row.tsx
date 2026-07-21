"use client";

import Link from "next/link";
import Image from "next/image";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { approveRequestAction, rejectRequestAction, manuallyApproveRequestAction } from "@/lib/requests/actions";
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
  const manualApproveAction = manuallyApproveRequestAction.bind(null, id);
  const [approveState, approveFormAction, isApproving] = useActionState(approveAction, undefined);
  const [rejectState, rejectFormAction, isRejecting] = useActionState(rejectAction, undefined);
  const [manualApproveState, manualApproveFormAction, isManuallyApproving] = useActionState(
    manualApproveAction,
    undefined,
  );

  const src = tmdbImageUrl(posterPath, "w92");
  const done = Boolean(approveState?.success || rejectState?.success || manualApproveState?.success);
  const anyPending = isApproving || isRejecting || isManuallyApproving;
  const showManualApprove = approveState?.error === SONARR_UNRESOLVED_ERROR;

  useEffect(() => {
    if (done) router.refresh();
  }, [done, router]);

  if (done) return null;

  return (
    <tr className="hover:bg-bg-1/60">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded-lg bg-bg-2">
            {src && <Image src={src} alt="" fill sizes="44px" className="object-cover" />}
          </div>
          <Link
            href={`/title/${mediaType}/${tmdbId}`}
            className="text-sm font-medium text-text-primary hover:text-accent"
          >
            {title}
          </Link>
        </div>
      </td>
      <td className="px-4 py-3 text-text-secondary">{requestedByName || requestedByUsername}</td>
      <td className="px-4 py-3 text-text-secondary">{new Date(createdAt).toLocaleDateString()}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <form action={rejectFormAction}>
            <button
              type="submit"
              disabled={anyPending}
              className="rounded-full border border-border-strong px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-red-400 hover:text-red-400 disabled:opacity-60"
            >
              {isRejecting ? "Rejecting…" : "Reject"}
            </button>
          </form>
          {showManualApprove ? (
            <form action={manualApproveFormAction}>
              <button
                type="submit"
                disabled={anyPending}
                title="Mark this approved without adding it via Sonarr — use once you've downloaded it yourself."
                className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                {isManuallyApproving ? "Approving…" : "Manually approve"}
              </button>
            </form>
          ) : (
            <form action={approveFormAction}>
              <button
                type="submit"
                disabled={anyPending}
                className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                {isApproving ? "Approving…" : "Approve"}
              </button>
            </form>
          )}
        </div>
        {(approveState?.error || rejectState?.error || manualApproveState?.error) && (
          <p className="mt-1.5 max-w-xs text-xs text-red-400">
            {approveState?.error || rejectState?.error || manualApproveState?.error}
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
      </td>
    </tr>
  );
}
