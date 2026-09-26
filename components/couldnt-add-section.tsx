"use client";

import Image from "next/image";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { manuallyApproveRequestAction, retryRequestAction } from "@/lib/requests/actions";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import { RequestTitle } from "@/components/request-title";
import { AddAdvancedOptions } from "@/components/add-advanced-options";
import { CommentSection } from "@/components/comment-thread";
import type { ReviewedRequest } from "@/lib/api/types";

function CouldntAddRow({ request, isAdmin }: { request: ReviewedRequest; isAdmin: boolean }) {
  const router = useRouter();
  const [retryState, retryAction, retrying] = useActionState(retryRequestAction.bind(null, request.id), undefined);
  const [manualState, manualAction, markingManual] = useActionState(
    manuallyApproveRequestAction.bind(null, request.id),
    undefined,
  );
  const done = Boolean(retryState?.success || manualState?.success);
  useEffect(() => {
    if (done) router.refresh();
  }, [done, router]);
  if (done || !request.addFailed) return null;

  const src = tmdbImageUrl(request.posterPath, "w92");
  const busy = retrying || markingManual;
  const error = retryState?.error ?? manualState?.error ?? request.addFailed.error;
  return (
    <li className="flex gap-3 px-4 py-3 text-sm">
      <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-bg-2">
        {src && <Image src={src} alt="" fill sizes="40px" className="object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <RequestTitle
          mediaType={request.mediaType}
          tmdbId={request.tmdbId}
          title={request.title}
          seasons={request.seasons}
          is4k={request.is4k}
        />
        <p className="mt-0.5 text-xs text-text-muted">
          {request.requestedBy.label} · approved {new Date(request.reviewedAt ?? request.addFailed.since).toLocaleDateString()} ·
          last tried {new Date(request.addFailed.since).toLocaleString()}
        </p>
        <p className="mt-1 text-xs text-red-400">{error}</p>
        <div className="mt-1.5">
          <AddAdvancedOptions
            mediaType={request.mediaType}
            tmdbId={request.tmdbId}
            is4k={request.is4k}
            formId={`retry-${request.id}`}
            disabled={busy}
          />
        </div>
        <CommentSection kind="request" id={request.id} count={request.commentCount} />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <form id={`retry-${request.id}`} action={retryAction}>
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
        </form>
        {isAdmin && (
          <form action={manualAction}>
            <button
              type="submit"
              disabled={busy}
              title="Mark it approved without Sonarr/Radarr — once you've got it some other way."
              className="text-xs text-text-muted hover:text-accent disabled:opacity-60"
            >
              {markingManual ? "Saving…" : "Added it by hand"}
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
export function CouldntAddSection({ requests, isAdmin }: { requests: ReviewedRequest[]; isAdmin: boolean }) {
  const failed = requests.filter((r) => r.addFailed);
  if (failed.length === 0) return null;
  return (
    <section id="couldnt-add" className="mt-12">
      <h2 className="font-display text-xl text-text-primary">Couldn&apos;t add</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Approved, but Sonarr/Radarr couldn&apos;t be reached or didn&apos;t take them. Retry once it&apos;s back.
      </p>
      <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
        {failed.map((request) => (
          <CouldntAddRow key={request.id} request={request} isAdmin={isAdmin} />
        ))}
      </ul>
    </section>
  );
}
