"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { approveRequestAction, rejectRequestAction, manuallyApproveRequestAction } from "@/lib/requests/actions";
import { useT } from "@/lib/i18n/client";
import { AddAdvancedOptions } from "@/components/add-advanced-options";
import type { MediaType } from "@/lib/db/schema";
import { EditRequestButton } from "@/components/request-lifecycle";
import { RequestCard } from "@/components/request-card";
import { DeclineReasonForm } from "@/components/decline-reason-chooser";

/** A pending request in the review queue: the card with Approve / Decline
 * (and the reason chooser), Edit, and the reviewer's Advanced picks. */
export function RequestReviewRow({
  id,
  mediaType,
  tmdbId,
  title,
  posterPath,
  backdropPath = null,
  requestedByName,
  requestedByUsername,
  seasons,
  is4k = false,
  canManuallyApprove = true,
  createdAt,
  editedAt = null,
  sonarrUrl,
  commentCount = 0,
  advanced = true,
}: {
  id: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  backdropPath?: string | null;
  requestedByName: string | null;
  requestedByUsername: string;
  /** The seasons asked for; null for the whole series. */
  seasons: number[] | null;
  is4k?: boolean;
  canManuallyApprove?: boolean;
  createdAt: string;
  /** The requester (or a reviewer) changed it since asking, when. */
  editedAt?: string | null;
  /** Admin's connected Sonarr base URL (Settings > Services), if any —
   * used to link straight to Sonarr's own "add series" search when Marquee
   * can't resolve this show's TVDB id itself. */
  sonarrUrl: string | null;
  /** Comments in its conversation, for the "Comments (2)" toggle. */
  commentCount?: number;
  /** The reviewer may pick the server, quality and folder (advancedRequests). */
  advanced?: boolean;
}) {
  const t = useT();
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

  // Reject is a two-step: the button opens a chooser for why
  // (DeclineReasonForm), and only "Decline request" actually submits.
  const [choosingReason, setChoosingReason] = useState(false);

  const done = Boolean(approveState?.success || rejectState?.success || manualApproveState?.success);
  const anyPending = isApproving || isRejecting || isManuallyApproving;
  // Only the admin can promise to add it by hand (a trusted reviewer can't).
  const showManualApprove = canManuallyApprove && approveState?.code === "sonarr_unresolved";
  const requester = requestedByName || requestedByUsername;

  useEffect(() => {
    if (done) router.refresh();
  }, [done, router]);

  if (done) return null;

  // In our own transition rather than the form's `action` (see DeclineReasonForm).
  function submitReject(formData: FormData) {
    startTransition(() => rejectFormAction(formData));
  }

  const error = approveState?.error || rejectState?.error || manualApproveState?.error;

  return (
    <RequestCard
      id={id}
      mediaType={mediaType}
      tmdbId={tmdbId}
      title={title}
      posterPath={posterPath}
      backdropPath={backdropPath}
      seasons={seasons}
      is4k={is4k}
      status={{ label: t("requests.waitingForReview"), className: "bg-info-bg text-info" }}
      requestedBy={{ name: requester }}
      requestedAt={createdAt}
      modifiedAt={editedAt}
      commentCount={commentCount}
      actions={
        <>
          {!choosingReason && <EditRequestButton requestId={id} />}
          <button
            type="button"
            disabled={anyPending || choosingReason}
            onClick={() => setChoosingReason(true)}
            className="rounded-full border border-border-strong px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-red-400 hover:text-red-400 disabled:opacity-60"
          >
            {isRejecting ? t("requests.rejecting") : t("requests.reject")}
          </button>
          {showManualApprove ? (
            <form action={manualApproveFormAction}>
              <button
                type="submit"
                disabled={anyPending}
                title={t("requests.manuallyApproveHint")}
                className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                {isManuallyApproving ? t("requests.approving") : t("requests.manuallyApprove")}
              </button>
            </form>
          ) : (
            <form id={`approve-${id}`} action={approveFormAction}>
              <button
                type="submit"
                disabled={anyPending}
                className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                {isApproving ? t("requests.approving") : t("common.approve")}
              </button>
            </form>
          )}
        </>
      }
      below={
        <>
          {advanced && !showManualApprove && !choosingReason && (
            <AddAdvancedOptions
              mediaType={mediaType}
              tmdbId={tmdbId}
              is4k={is4k}
              formId={`approve-${id}`}
              requestId={id}
              disabled={anyPending}
            />
          )}
          {choosingReason && (
            <DeclineReasonForm
              requesterName={requester}
              busy={anyPending}
              declining={isRejecting}
              onDecline={submitReject}
              onCancel={() => setChoosingReason(false)}
            />
          )}
          {error && (
            <p className="mt-1.5 max-w-xs text-xs text-red-400">
              {error}
              {approveState?.code === "sonarr_unresolved" && sonarrUrl && (
                <>
                  {" — "}
                  <a
                    href={`${sonarrUrl}/add/new?term=${encodeURIComponent(title)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-text-secondary underline underline-offset-2 hover:text-accent"
                  >
                    {t("requests.addManuallyInSonarr")}
                  </a>
                </>
              )}
            </p>
          )}
        </>
      }
    />
  );
}
