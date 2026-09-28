"use client";

import Image from "next/image";
import { startTransition, useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { manuallyApproveRequestAction, rejectRequestAction, retryRequestAction } from "@/lib/requests/actions";
import {
  CUSTOM_REJECTION_REASON,
  REJECTION_REASON_CODES,
  REJECTION_REASON_MAX_LENGTH,
  rejectionReasonText,
} from "@/lib/requests/rejection-reasons";
import { useT } from "@/lib/i18n/client";
import { formatDate } from "@/lib/i18n/format";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import { RequestTitle } from "@/components/request-title";
import { AddAdvancedOptions } from "@/components/add-advanced-options";
import { CommentSection } from "@/components/comment-thread";
import type { ReviewedRequest } from "@/lib/api/types";
import { TONE_CLASS } from "@/lib/library/status-tone";

function CouldntAddRow({ request, isAdmin, advanced }: { request: ReviewedRequest; isAdmin: boolean; advanced: boolean }) {
  const t = useT();
  const router = useRouter();
  const [retryState, retryAction, retrying] = useActionState(retryRequestAction.bind(null, request.id), undefined);
  const [manualState, manualAction, markingManual] = useActionState(
    manuallyApproveRequestAction.bind(null, request.id),
    undefined,
  );
  const [rejectState, rejectAction, rejecting] = useActionState(rejectRequestAction.bind(null, request.id), undefined);
  // Decline is the review queue's two-step: pick why, then "Decline request".
  const [choosingReason, setChoosingReason] = useState(false);
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const canDecline = reason === CUSTOM_REJECTION_REASON ? customReason.trim().length > 0 : reason.length > 0;
  const done = Boolean(retryState?.success || manualState?.success || rejectState?.success);
  useEffect(() => {
    if (done) router.refresh();
  }, [done, router]);
  if (done || !request.addFailed) return null;

  const src = tmdbImageUrl(request.posterPath, "w92");
  const busy = retrying || markingManual || rejecting;
  const error = retryState?.error ?? manualState?.error ?? rejectState?.error ?? request.addFailed.error;

  // Submitted by hand (as in the review queue's row) so a failed decline
  // doesn't reset the chosen reason.
  function submitReject(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => rejectAction(formData));
  }
  return (
    <li className="flex gap-3 px-4 py-3 text-sm">
      <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-bg-2">
        {src && <Image src={src} alt="" fill sizes="40px" className="object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start gap-2">
          <RequestTitle
            mediaType={request.mediaType}
            tmdbId={request.tmdbId}
            title={request.title}
            seasons={request.seasons}
            is4k={request.is4k}
          />
          {/* The Missing tone, like "Can't find": approved but not there yet. */}
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_CLASS.missing.pill}`}>
            {t("requests.couldntAdd")}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-text-muted">
          {t("requests.couldntAddMeta", {
            name: request.requestedBy.label,
            approved: formatDate(t, request.reviewedAt ?? request.addFailed.since),
            tried: formatDate(t, request.addFailed.since, "full"),
          })}
        </p>
        <p className="mt-1 text-xs text-red-400">{error}</p>
        {advanced && (
        <div className="mt-1.5">
          <AddAdvancedOptions
            mediaType={request.mediaType}
            tmdbId={request.tmdbId}
            is4k={request.is4k}
            formId={`retry-${request.id}`}
            requestId={request.id}
            disabled={busy}
          />
        </div>
        )}
        {choosingReason && (
          <form
            onSubmit={submitReject}
            className="mt-2 flex max-w-xs flex-col gap-2 rounded-xl border border-border bg-bg-1 p-3 text-xs"
          >
            <p className="text-text-secondary">{t("requests.letThemKnowWhy", { name: request.requestedBy.label })}</p>
            {([...REJECTION_REASON_CODES, CUSTOM_REJECTION_REASON] as const).map((preset) => (
              <label key={preset} className="flex items-center gap-2 text-text-primary">
                <input
                  type="radio"
                  name="reason"
                  value={preset}
                  checked={reason === preset}
                  onChange={() => setReason(preset)}
                  className="h-4 w-4 border-border accent-accent"
                />
                {preset === CUSTOM_REJECTION_REASON ? t("requests.reasonOther") : rejectionReasonText(t, preset)}
              </label>
            ))}
            {reason === CUSTOM_REJECTION_REASON && (
              <input
                type="text"
                name="customReason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                maxLength={REJECTION_REASON_MAX_LENGTH}
                placeholder={t("requests.tellThemWhy")}
                autoFocus
                className="rounded-lg border border-border bg-bg-0 px-2.5 py-1.5 text-text-primary outline-none focus:border-accent"
              />
            )}
            <div className="mt-1 flex gap-2">
              <button
                type="submit"
                disabled={busy || !canDecline}
                className="rounded-full border border-border-strong px-3 py-1.5 text-text-primary transition-colors hover:border-red-400 hover:text-red-400 disabled:opacity-60"
              >
                {rejecting ? t("requests.declining") : t("requests.declineRequest")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setChoosingReason(false);
                  setReason("");
                  setCustomReason("");
                }}
                className="rounded-full border border-border-strong px-3 py-1.5 text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
              >
                {t("common.cancel")}
              </button>
            </div>
          </form>
        )}
        <CommentSection kind="request" id={request.id} count={request.commentCount} />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <form id={`retry-${request.id}`} action={retryAction}>
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {retrying ? t("requests.retrying") : t("requests.retryButton")}
          </button>
        </form>
        <button
          type="button"
          disabled={busy || choosingReason}
          onClick={() => setChoosingReason(true)}
          className="rounded-full border border-border-strong px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-red-400 hover:text-red-400 disabled:opacity-60"
        >
          {t("common.decline")}
        </button>
        {isAdmin && (
          <form action={manualAction}>
            <button
              type="submit"
              disabled={busy}
              title={t("requests.addedByHandHint")}
              className="text-xs text-text-muted hover:text-accent disabled:opacity-60"
            >
              {markingManual ? t("common.saving") : t("requests.addedByHand")}
            </button>
          </form>
        )}
      </div>
    </li>
  );
}

/** "Couldn't add" on the Requests page: approved requests Sonarr/Radarr
 * couldn't be reached (or errored) to add, each with its error and Retry.
 * Hidden when there are none. */
export function CouldntAddSection({
  requests,
  isAdmin,
  advanced,
}: {
  requests: ReviewedRequest[];
  isAdmin: boolean;
  /** The reviewer may pick the server, quality and folder (advancedRequests). */
  advanced: boolean;
}) {
  const t = useT();
  const failed = requests.filter((r) => r.addFailed);
  if (failed.length === 0) return null;
  return (
    <section id="couldnt-add" className="mt-12">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="font-display text-xl text-text-primary">{t("requests.couldntAdd")}</h2>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASS.missing.pill}`}>
          {failed.length}
        </span>
      </div>
      <p className="mt-1 text-sm text-text-secondary">{t("requests.couldntAddIntro")}</p>
      <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
        {failed.map((request) => (
          <CouldntAddRow key={request.id} request={request} isAdmin={isAdmin} advanced={advanced} />
        ))}
      </ul>
    </section>
  );
}
