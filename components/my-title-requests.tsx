"use client";

import { CommentSection } from "@/components/comment-thread";
import { CancelRequestButton, EditRequestButton } from "@/components/request-lifecycle";
import type { TitleRequestSummary } from "@/lib/api/types";

const STATUS_WORDS: Record<string, string> = {
  pending: "waiting for review",
  approved: "approved",
  rejected: "declined",
};

/** Under the title page's actions: the viewer's own requests for this
 * title — what was asked for and where it stands, with Edit / Cancel while
 * it's pending, and its conversation with the reviewers. */
export function MyTitleRequests({ requests }: { requests: TitleRequestSummary[] }) {
  if (requests.length === 0) return null;
  return (
    <div className="mt-4 flex flex-col gap-2">
      {requests.map((request) => {
        const what = [request.seasonsLabel, request.is4k ? "In 4K" : null].filter(Boolean).join(" · ");
        return (
          <div key={request.id} className="rounded-xl border border-border bg-bg-1/70 px-3.5 py-2.5 text-[13px]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-text-primary">
                Your request{what ? ` (${what})` : ""} is {STATUS_WORDS[request.status] ?? request.status}
              </span>
              {request.canEdit && <EditRequestButton requestId={request.id} />}
              {request.canCancel && <CancelRequestButton requestId={request.id} />}
            </div>
            <CommentSection kind="request" id={request.id} count={request.commentCount} />
          </div>
        );
      })}
    </div>
  );
}
