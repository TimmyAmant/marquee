"use client";

import { CommentSection } from "@/components/comment-thread";
import { CancelRequestButton, EditRequestButton } from "@/components/request-lifecycle";
import type { TitleRequestSummary } from "@/lib/api/types";
import { useT } from "@/lib/i18n/client";

/** Under the title page's actions: the viewer's own requests for this
 * title — what was asked for and where it stands, with Edit / Cancel while
 * it's pending, and its conversation with the reviewers. A removed one's
 * reason comes already in the viewer's language (the page localizes it). */
export function MyTitleRequests({ requests }: { requests: TitleRequestSummary[] }) {
  const t = useT();
  if (requests.length === 0) return null;
  return (
    <div className="mt-4 flex flex-col gap-2">
      {requests.map((request) => {
        const what = [request.seasonsLabel, request.is4k ? t("title.fourKOwned") : null].filter(Boolean).join(" · ");
        // Approved, then taken off Sonarr/Radarr again: "was removed from the server".
        const status = request.removedAt ? "removed" : request.status;
        return (
          <div key={request.id} className="rounded-xl border border-border bg-bg-1/70 px-3.5 py-2.5 text-[13px]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-text-primary">
                {what ? t("title.myRequestStatusWith", { status, what }) : t("title.myRequestStatus", { status })}
              </span>
              {request.canEdit && <EditRequestButton requestId={request.id} />}
              {request.canCancel && <CancelRequestButton requestId={request.id} />}
            </div>
            {request.removedAt && request.removedReason && (
              <p className="mt-1 text-xs text-text-muted">
                {t("requests.reasonLine", { reason: request.removedReason })}
              </p>
            )}
            <CommentSection kind="request" id={request.id} count={request.commentCount} />
          </div>
        );
      })}
    </div>
  );
}
