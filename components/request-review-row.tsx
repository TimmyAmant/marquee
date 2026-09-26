"use client";

import Image from "next/image";
import { startTransition, useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { approveRequestAction, rejectRequestAction, manuallyApproveRequestAction } from "@/lib/requests/actions";
import { SONARR_UNRESOLVED_ERROR } from "@/lib/requests/errors";
import {
  CUSTOM_REJECTION_REASON,
  REJECTION_REASON_MAX_LENGTH,
  REJECTION_REASON_PRESETS,
} from "@/lib/requests/rejection-reasons";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import { RequestTitle } from "@/components/request-title";
import type { MediaType } from "@/lib/db/schema";

export function RequestReviewRow({
  id,
  mediaType,
  tmdbId,
  title,
  posterPath,
  requestedByName,
  requestedByUsername,
  seasons,
  is4k = false,
  canManuallyApprove = true,
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
  /** The seasons asked for; null for the whole series. */
  seasons: number[] | null;
  is4k?: boolean;
  canManuallyApprove?: boolean;
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

  // Reject is a two-step: the button opens a chooser for why, and only
  // "Decline request" actually submits. The requester sees the reason on
  // their Requests page and in the notification, so it's required here
  // (the server action re-checks either way).
  const [choosingReason, setChoosingReason] = useState(false);
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");

  const src = tmdbImageUrl(posterPath, "w92");
  const done = Boolean(approveState?.success || rejectState?.success || manualApproveState?.success);
  const anyPending = isApproving || isRejecting || isManuallyApproving;
  // Only the admin can promise to add it by hand (a trusted reviewer can't).
  const showManualApprove = canManuallyApprove && approveState?.error === SONARR_UNRESOLVED_ERROR;
  const requester = requestedByName || requestedByUsername;
  const canDecline =
    reason === CUSTOM_REJECTION_REASON ? customReason.trim().length > 0 : reason.length > 0;

  useEffect(() => {
    if (done) router.refresh();
  }, [done, router]);

  if (done) return null;

  function cancelReject() {
    setChoosingReason(false);
    setReason("");
    setCustomReason("");
  }

  // Submitted by hand instead of through the form's `action` prop. React
  // resets a form after every action it runs for it, and that reset unchecks
  // the controlled radios (the browser falls back to their mount-time
  // defaultChecked, which is false) while `reason` still holds the choice. A
  // failed decline would then show no selection next to an enabled button,
  // and retrying would post no reason at all. Running the action in our own
  // transition skips that reset, and useActionState's pending/error state
  // still updates as before.
  function submitReject(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => rejectFormAction(formData));
  }

  return (
    <tr className="hover:bg-bg-1/60">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded-lg bg-bg-2">
            {src && <Image src={src} alt="" fill sizes="44px" className="object-cover" />}
          </div>
          <RequestTitle mediaType={mediaType} tmdbId={tmdbId} title={title} seasons={seasons} is4k={is4k} />
        </div>
      </td>
      <td className="px-4 py-3 text-text-secondary">{requester}</td>
      <td className="px-4 py-3 text-text-secondary">{new Date(createdAt).toLocaleDateString()}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={anyPending || choosingReason}
            onClick={() => setChoosingReason(true)}
            className="rounded-full border border-border-strong px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-red-400 hover:text-red-400 disabled:opacity-60"
          >
            {isRejecting ? "Rejecting…" : "Reject"}
          </button>
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
        {choosingReason && (
          <form
            onSubmit={submitReject}
            className="mt-2 flex max-w-xs flex-col gap-2 rounded-xl border border-border bg-bg-1 p-3 text-xs"
          >
            <p className="text-text-secondary">Let {requester} know why:</p>
            {[...REJECTION_REASON_PRESETS, CUSTOM_REJECTION_REASON].map((preset) => (
              <label key={preset} className="flex items-center gap-2 text-text-primary">
                <input
                  type="radio"
                  name="reason"
                  value={preset}
                  checked={reason === preset}
                  onChange={() => setReason(preset)}
                  className="h-4 w-4 border-border accent-accent"
                />
                {preset}
              </label>
            ))}
            {reason === CUSTOM_REJECTION_REASON && (
              <input
                type="text"
                name="customReason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                maxLength={REJECTION_REASON_MAX_LENGTH}
                placeholder="Tell them why"
                autoFocus
                className="rounded-lg border border-border bg-bg-0 px-2.5 py-1.5 text-text-primary outline-none focus:border-accent"
              />
            )}
            <div className="mt-1 flex gap-2">
              <button
                type="submit"
                disabled={anyPending || !canDecline}
                className="rounded-full border border-border-strong px-3 py-1.5 text-text-primary transition-colors hover:border-red-400 hover:text-red-400 disabled:opacity-60"
              >
                {isRejecting ? "Declining…" : "Decline request"}
              </button>
              <button
                type="button"
                disabled={anyPending}
                onClick={cancelReject}
                className="rounded-full border border-border-strong px-3 py-1.5 text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
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
