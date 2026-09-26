import Image from "next/image";
import { redirect } from "next/navigation";
import { getPendingRequests, getReviewedRequests, getMyRequests } from "@/lib/requests/query";
import { RequestReviewRow } from "@/components/request-review-row";
import { ApproveAllRequestsButton } from "@/components/approve-all-requests-button";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { getArrCredential } from "@/lib/integrations/credentials";
import type { LibraryStatus } from "@/components/status-badge";
import type { RequestStatus } from "@/lib/db/schema";
import { myRequestBadge as badgeFor, reviewedRequestLabel, type MyRequestBadgeTone } from "@/lib/requests/labels";
import { RequestTitle } from "@/components/request-title";
import { IssuesSection } from "@/components/issues-section";
import { getQuotas, untilLabel, type QuotaState } from "@/lib/requests/quota";
import { listIssues } from "@/lib/issues";
import { issueDto, notFoundRequest, reviewedRequest } from "@/lib/api/mappers";
import { countComments } from "@/lib/comments";
import { CommentToggle, ThreadRow } from "@/components/comment-thread";
import { CancelRequestButton, EditRequestButton } from "@/components/request-lifecycle";
import { CouldntAddSection } from "@/components/couldnt-add-section";
import { NotFoundSection } from "@/components/not-found-section";
import { getNotFoundAfterHours, getNotFoundRequests } from "@/lib/requests/not-found";

const BADGE_CLASS: Record<MyRequestBadgeTone, string> = {
  pending: "bg-tracked-bg text-tracked",
  declined: "bg-untracked-bg text-text-secondary",
  owned: "bg-owned-bg text-owned",
  downloading: "bg-tracked-bg text-tracked",
  coming_soon: "bg-untracked-bg text-text-secondary",
  approved: "bg-tracked-bg text-tracked",
};

function myRequestBadge(
  status: RequestStatus,
  libraryStatus: LibraryStatus | null,
  manuallyApproved: boolean,
  waitingToBeAdded: boolean,
): {
  label: string;
  className: string;
} {
  // Label wording shared with GET /api/v1/requests/mine.
  const { label, tone } = badgeFor(status, libraryStatus, manuallyApproved, waitingToBeAdded);
  return { label, className: BADGE_CLASS[tone] };
}

/** "Movies: 3 of 5 left for the next 7 days" — or when the next frees up. */
function quotaLine(label: string, quota: QuotaState): string {
  if (quota.remaining > 0) return `${label}: ${quota.remaining} of ${quota.limit} requests left (every ${quota.days} days)`;
  return `${label}: none left${quota.nextSlotAt ? ` — more ${untilLabel(quota.nextSlotAt, new Date())}` : ""}`;
}

export default async function RequestsPage() {
  const viewer = await getViewerContext();
  if (!viewer.session) redirect("/login");

  // The review queue is the admin's and trusted members' (lib/users/roles.ts).
  const reviews = viewer.isAdmin || viewer.session.user.role === "trusted";
  const issueRows = await listIssues({ userId: viewer.userId, isAdmin: reviews });
  const issueComments = await countComments(
    "issue",
    issueRows.map((row) => row.id),
  );
  const issues = issueRows.map((row) => issueDto(row, viewer.userId, issueComments.get(row.id) ?? 0));

  if (!reviews) {
    const [myRequests, quotas] = await Promise.all([
      getMyRequests(viewer.userId, viewer.libraryOwnerId),
      getQuotas(viewer.userId),
    ]);
    const myComments = await countComments(
      "request",
      myRequests.map((r) => r.id),
    );
    const limits = [
      quotas.movie ? quotaLine("Movies", quotas.movie) : null,
      quotas.tv ? quotaLine("TV", quotas.tv) : null,
    ].filter(Boolean);

    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        {limits.length > 0 && <p className="mb-4 text-sm text-text-secondary">{limits.join(" · ")}</p>}
        {myRequests.length === 0 ? (
          <p className="text-sm text-text-muted">
            You haven&apos;t requested anything yet — find a title and hit Request.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-bg-1 text-text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Requested</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {myRequests.map((r) => {
                  const src = tmdbImageUrl(r.posterPath, "w92");
                  const badge = myRequestBadge(r.status, r.libraryStatus, r.manuallyApproved, r.addFailedAt !== null);
                  return (
                    <ThreadRow
                      key={r.id}
                      kind="request"
                      id={r.id}
                      count={myComments.get(r.id) ?? 0}
                      colSpan={3}
                      className="hover:bg-bg-1/60"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-bg-2">
                            {src && (
                              <Image src={src} alt="" fill sizes="40px" className="object-cover" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <RequestTitle
                              mediaType={r.mediaType}
                              tmdbId={r.tmdbId}
                              title={r.title}
                              seasons={r.seasons}
                              is4k={r.is4k}
                            />
                            <CommentToggle />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                        {r.status === "rejected" && r.rejectionReason && (
                          <p className="mt-1.5 text-xs text-text-muted">Reason: {r.rejectionReason}</p>
                        )}
                        {r.status === "pending" && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <EditRequestButton requestId={r.id} />
                            <CancelRequestButton requestId={r.id} />
                          </div>
                        )}
                        {r.status === "approved" && (
                          <p className="mt-1.5 text-xs text-text-muted">Need a change? Ask in its comments.</p>
                        )}
                      </td>
                    </ThreadRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <IssuesSection issues={issues} isAdmin={false} />
      </div>
    );
  }

  // Reconciliation checks library status against whichever account actually
  // holds the Sonarr/Radarr credentials — today that's always this admin,
  // but resolve properly rather than assuming session.user.id === owner, in
  // case a second admin account without its own integrations ever exists.
  const [pending, reviewed, sonarrCred, sonarr4kCred, notFound, notFoundAfterHours] = await Promise.all([
    getPendingRequests(viewer.libraryOwnerId),
    getReviewedRequests(),
    getArrCredential(viewer.libraryOwnerId, "sonarr"),
    getArrCredential(viewer.libraryOwnerId, "sonarr4k"),
    getNotFoundRequests().catch(() => []),
    getNotFoundAfterHours().catch(() => 24),
  ]);
  const sonarrUrl = sonarrCred?.baseUrl ?? null;
  const requestComments = await countComments("request", [...pending.map((r) => r.id), ...reviewed.map((r) => r.id)]);
  const couldntAdd = reviewed.filter((r) => r.status === "approved" && r.addFailedAt);
  const pastRequests = reviewed.filter((r) => !(r.status === "approved" && r.addFailedAt));
  // "Add manually in Sonarr" for a 4K request points at the 4K Sonarr.
  const sonarr4kUrl = sonarr4kCred?.baseUrl ?? null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      {pending.length > 1 && (
        <div className="flex justify-end">
          <ApproveAllRequestsButton />
        </div>
      )}

      {pending.length === 0 ? (
        <p className="text-sm text-text-muted">No pending requests.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-bg-1 text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Requested by</th>
                <th className="px-4 py-3 font-medium">Requested</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pending.map((r) => (
                <RequestReviewRow
                  key={r.id}
                  id={r.id}
                  mediaType={r.mediaType}
                  tmdbId={r.tmdbId}
                  title={r.title}
                  posterPath={r.posterPath}
                  requestedByName={r.requestedByName}
                  requestedByUsername={r.requestedByUsername}
                  seasons={r.seasons}
                  is4k={r.is4k}
                  canManuallyApprove={viewer.isAdmin}
                  createdAt={r.createdAt.toISOString()}
                  sonarrUrl={r.is4k ? sonarr4kUrl : sonarrUrl}
                  commentCount={requestComments.get(r.id) ?? 0}
                  edited={r.editedAt !== null}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CouldntAddSection
        requests={couldntAdd.map((r) => reviewedRequest(r, requestComments.get(r.id) ?? 0))}
        isAdmin={viewer.isAdmin}
      />

      <NotFoundSection requests={notFound.map(notFoundRequest)} afterHours={notFoundAfterHours} />

      <IssuesSection issues={issues} isAdmin />

      {pastRequests.length > 0 && (
        <>
          <h2 className="mt-12 font-display text-xl text-text-primary">Past requests</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-bg-1 text-text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Requested by</th>
                  <th className="px-4 py-3 font-medium">Requested</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pastRequests.map((r) => {
                  const src = tmdbImageUrl(r.posterPath, "w92");
                  return (
                    <ThreadRow
                      key={r.id}
                      kind="request"
                      id={r.id}
                      count={requestComments.get(r.id) ?? 0}
                      colSpan={4}
                      className="hover:bg-bg-1/60"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-bg-2">
                            {src && (
                              <Image src={src} alt="" fill sizes="40px" className="object-cover" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <RequestTitle
                              mediaType={r.mediaType}
                              tmdbId={r.tmdbId}
                              title={r.title}
                              seasons={r.seasons}
                              is4k={r.is4k}
                            />
                            <CommentToggle />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {r.requestedByName || r.requestedByUsername}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            r.status === "approved"
                              ? "bg-owned-bg text-owned"
                              : "bg-untracked-bg text-text-secondary"
                          }`}
                        >
                          {reviewedRequestLabel(r.status, r.manuallyApproved)}
                        </span>
                        {r.status === "rejected" && r.rejectionReason && (
                          <p className="mt-1.5 text-xs text-text-muted">Reason: {r.rejectionReason}</p>
                        )}
                        {r.status === "approved" && r.notFoundSince && (
                          <a
                            href="#cant-find"
                            className="ml-1.5 rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-500"
                          >
                            Can&apos;t find
                          </a>
                        )}
                        {r.status === "approved" && !r.manuallyApproved && r.arrServerName && (
                          <p className="mt-1.5 text-xs text-text-muted">Added to {r.arrServerName}</p>
                        )}
                      </td>
                    </ThreadRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
