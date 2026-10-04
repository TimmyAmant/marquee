import { redirect } from "next/navigation";
import { getPendingRequests, getReviewedRequests, getMyRequests } from "@/lib/requests/query";
import { RequestReviewRow } from "@/components/request-review-row";
import { ApproveAllRequestsButton } from "@/components/approve-all-requests-button";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { getArrCredential } from "@/lib/integrations/credentials";
import type { LibraryStatus } from "@/components/status-badge";
import type { RequestStatus } from "@/lib/db/schema";
import { myRequestBadge as badgeFor, reviewedRequestLabel, type MyRequestBadgeTone } from "@/lib/requests/labels";
import { RequestCard } from "@/components/request-card";
import { CantGetItRequestCard } from "@/components/decline-reason-chooser";
import { IssuesSection } from "@/components/issues-section";
import { getQuotas, type QuotaState } from "@/lib/requests/quota";
import { listIssues } from "@/lib/issues";
import { issueDto, notFoundRequest, reviewedRequest } from "@/lib/api/mappers";
import { getT } from "@/lib/i18n/server";
import { translatorFor } from "@/lib/i18n/catalog";
import { LOCALES } from "@/lib/i18n/locales";
import type { Translator } from "@/lib/i18n/translator";
import { localizeRejectionReason } from "@/lib/requests/rejection-reasons";
import { countComments } from "@/lib/comments";
import { CancelRequestButton, EditRequestButton } from "@/components/request-lifecycle";
import { CouldntAddSection } from "@/components/couldnt-add-section";
import { NotFoundSection } from "@/components/not-found-section";
import { getNotFoundAfterHours, getNotFoundRequests } from "@/lib/requests/not-found";
import { can } from "@/lib/users/permissions";
import { attentionCount } from "@/lib/requests/access";
import { RequestsAutoRefresh } from "@/components/requests-auto-refresh";

const BADGE_CLASS: Record<MyRequestBadgeTone, string> = {
  pending: "bg-info-bg text-info",
  declined: "bg-untracked-bg text-text-secondary",
  owned: "bg-owned-bg text-owned",
  downloading: "bg-downloading-bg text-downloading",
  coming_soon: "bg-soon-bg text-soon",
  approved: "bg-info-bg text-info",
};

function myRequestBadge(
  t: Translator,
  status: RequestStatus,
  libraryStatus: LibraryStatus | null,
  manuallyApproved: boolean,
  waitingToBeAdded: boolean,
  removed: boolean,
): {
  label: string;
  className: string;
} {
  // Label wording shared with GET /api/v1/requests/mine.
  const { label, tone } = badgeFor(t, status, libraryStatus, manuallyApproved, waitingToBeAdded, removed);
  return { label, className: BADGE_CLASS[tone] };
}

/** When the next request frees up, relative so it reads right whatever time
 * zone the server and the member are in: "within the hour", "in 5 hours",
 * "tomorrow", "in 3 days". */
function untilText(t: Translator, when: Date, now: Date): string {
  const ms = when.getTime() - now.getTime();
  const hours = Math.ceil(ms / (60 * 60 * 1000));
  if (hours <= 1) return t("requests.quotaWithinHour");
  const relative = new Intl.RelativeTimeFormat(t.tag, { numeric: "auto" });
  if (hours < 24) return relative.format(hours, "hour");
  return relative.format(Math.ceil(ms / (24 * 60 * 60 * 1000)), "day");
}

/** "Movies: 3 of 5 requests left (every 7 days)" — or when the next frees up. */
function quotaLine(t: Translator, kind: "movie" | "tv", quota: QuotaState): string {
  if (quota.remaining > 0) {
    return t("requests.quotaLine", { kind, remaining: quota.remaining, limit: quota.limit, days: quota.days });
  }
  if (!quota.nextSlotAt) return t("requests.quotaNoneLeft", { kind });
  return t("requests.quotaNoneLeftUntil", { kind, when: untilText(t, quota.nextSlotAt, new Date()) });
}

/** A declined or removed request's reason, a preset in the viewer's language. */
function reasonText(t: Translator, reason: string): string {
  return t("requests.reasonLine", {
    reason: localizeRejectionReason(t, reason, LOCALES.map((locale) => translatorFor(locale))),
  });
}

/** Why a reviewed request ended where it did, when someone said: the
 * decline's reason, or the reason it was removed from Sonarr/Radarr. */
function reviewedReason(r: {
  status: RequestStatus;
  rejectionReason: string | null;
  removedAt: Date | null;
  removedReason: string | null;
}): string | null {
  if (r.status === "rejected") return r.rejectionReason;
  if (r.status === "approved" && r.removedAt) return r.removedReason;
  return null;
}

/** The Past requests / Everyone's requests pill: approved in the owned
 * tone, anything else (declined, removed) neutral. */
function reviewedPillClass(status: RequestStatus, removed: boolean): string {
  return status === "approved" && !removed ? "bg-owned-bg text-owned" : "bg-untracked-bg text-text-secondary";
}

export default async function RequestsPage() {
  const viewer = await getViewerContext();
  if (!viewer.session) redirect("/login");

  // Who sees what here is their permissions (lib/users/permissions.ts): the
  // review queue (with Can't find and Couldn't add) for whoever reviews
  // requests, everyone's requests to look at for whoever may see them, and
  // every problem report for whoever handles them.
  const user = viewer.session.user;
  const reviews = can(user, "reviewRequests");
  const seesEveryone = can(user, "viewRequests");
  const managesIssues = can(user, "manageIssues");
  const advanced = can(user, "advancedRequests");
  const issueRows = await listIssues({ userId: viewer.userId, managesIssues });
  const issueComments = await countComments(
    "issue",
    issueRows.map((row) => row.id),
  );
  const t = await getT();
  const issues = issueRows.map((row) => issueDto(t, row, viewer.userId, issueComments.get(row.id) ?? 0));

  if (!reviews) {
    const [myRequests, quotas, everyonePending, everyoneReviewed] = await Promise.all([
      getMyRequests(viewer.userId, viewer.libraryOwnerId),
      getQuotas(viewer.userId),
      seesEveryone ? getPendingRequests(viewer.libraryOwnerId) : Promise.resolve([]),
      seesEveryone ? getReviewedRequests() : Promise.resolve([]),
    ]);
    // Everyone else's, newest first, for someone who may see them but not
    // review them: to look at, no buttons.
    const othersRequests = [
      ...everyonePending.map((r) => ({ ...r, status: "pending" as const, manuallyApproved: false })),
      ...everyoneReviewed,
    ]
      .filter((r) => r.requestedByUserId !== viewer.userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const myComments = await countComments(
      "request",
      myRequests.map((r) => r.id),
    );
    const limits = [
      quotas.movie ? quotaLine(t, "movie", quotas.movie) : null,
      quotas.tv ? quotaLine(t, "tv", quotas.tv) : null,
    ].filter(Boolean);

    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        {limits.length > 0 && <p className="mb-4 text-sm text-text-secondary">{limits.join(" · ")}</p>}
        {myRequests.length === 0 ? (
          <p className="text-sm text-text-muted">{t("requests.noRequestsYet")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {myRequests.map((r) => {
              const removed = r.status === "approved" && r.removedAt !== null;
              const badge = myRequestBadge(t, r.status, r.libraryStatus, r.manuallyApproved, r.addFailedAt !== null, removed);
              const reviewer = r.reviewedByName || r.reviewedByUsername;
              const reason = reviewedReason(r);
              return (
                <RequestCard
                  key={r.id}
                  id={r.id}
                  mediaType={r.mediaType}
                  tmdbId={r.tmdbId}
                  title={r.title}
                  posterPath={r.posterPath}
                  backdropPath={r.backdropPath}
                  seasons={r.seasons}
                  is4k={r.is4k}
                  status={badge}
                  requestedBy={{ name: viewer.session.user.name || viewer.session.user.username || "" }}
                  requestedAt={r.createdAt}
                  modifiedAt={r.reviewedAt ?? r.editedAt}
                  modifiedBy={reviewer ? { name: reviewer } : null}
                  addedTo={r.status === "approved" && !r.manuallyApproved && !removed ? r.arrServerName : null}
                  commentCount={myComments.get(r.id) ?? 0}
                  notes={
                    <>
                      {reason && <p className="text-xs text-text-muted">{reasonText(t, reason)}</p>}
                      {r.status === "approved" && !removed && (
                        <p className="text-xs text-text-muted">{t("requests.askInComments")}</p>
                      )}
                    </>
                  }
                  actions={
                    r.status === "pending" ? (
                      <>
                        <EditRequestButton requestId={r.id} />
                        <CancelRequestButton requestId={r.id} />
                      </>
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        )}
        {seesEveryone && <EveryonesRequests t={t} requests={othersRequests} />}
        <IssuesSection issues={issues} isAdmin={managesIssues} />
      </div>
    );
  }

  // Reconciliation checks library status against whichever account actually
  // holds the Sonarr/Radarr credentials — today that's always this admin,
  // but resolve properly rather than assuming session.user.id === owner, in
  // case a second admin account without its own integrations ever exists.
  const [pending, reviewed, sonarrCred, sonarr4kCred, notFound, notFoundAfterHours, attention] = await Promise.all([
    getPendingRequests(viewer.libraryOwnerId),
    getReviewedRequests(),
    getArrCredential(viewer.libraryOwnerId, "sonarr"),
    getArrCredential(viewer.libraryOwnerId, "sonarr4k"),
    getNotFoundRequests().catch(() => []),
    getNotFoundAfterHours().catch(() => 24),
    attentionCount(user).catch(() => 0),
  ]);
  const sonarrUrl = sonarrCred?.baseUrl ?? null;
  const requestComments = await countComments("request", [...pending.map((r) => r.id), ...reviewed.map((r) => r.id)]);
  const couldntAdd = reviewed.filter((r) => r.status === "approved" && r.addFailedAt);
  const pastRequests = reviewed.filter((r) => !(r.status === "approved" && r.addFailedAt));
  // "Add manually in Sonarr" for a 4K request points at the 4K Sonarr.
  const sonarr4kUrl = sonarr4kCred?.baseUrl ?? null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <RequestsAutoRefresh initialCount={attention} />
      {pending.length > 1 && reviews && (
        <div className="flex justify-end">
          <ApproveAllRequestsButton />
        </div>
      )}

      {pending.length === 0 ? (
        <p className="text-sm text-text-muted">{t("requests.noPending")}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {pending.map((r) => (
            <RequestReviewRow
              key={r.id}
              id={r.id}
              mediaType={r.mediaType}
              tmdbId={r.tmdbId}
              title={r.title}
              posterPath={r.posterPath}
              backdropPath={r.backdropPath}
              requestedByName={r.requestedByName}
              requestedByUsername={r.requestedByUsername}
              seasons={r.seasons}
              is4k={r.is4k}
              canManuallyApprove={viewer.isAdmin}
              advanced={advanced}
              createdAt={r.createdAt.toISOString()}
              editedAt={r.editedAt?.toISOString() ?? null}
              sonarrUrl={r.is4k ? sonarr4kUrl : sonarrUrl}
              commentCount={requestComments.get(r.id) ?? 0}
            />
          ))}
        </div>
      )}

      <CouldntAddSection
        requests={couldntAdd.map((r) => reviewedRequest(t, r, requestComments.get(r.id) ?? 0))}
        isAdmin={viewer.isAdmin}
        advanced={advanced}
      />

      <NotFoundSection requests={notFound.map((r) => notFoundRequest(t, r))} afterHours={notFoundAfterHours} />

      <IssuesSection issues={issues} isAdmin={managesIssues} />

      {pastRequests.length > 0 && (
        <>
          <h2 className="mt-12 font-display text-xl text-text-primary">{t("requests.pastRequests")}</h2>
          <div className="mt-4 flex flex-col gap-3">
            {pastRequests.map((r) => {
              const reviewer = r.reviewedByName || r.reviewedByUsername;
              const removed = r.status === "approved" && r.removedAt !== null;
              const reason = reviewedReason(r);
              const card = {
                id: r.id,
                mediaType: r.mediaType,
                tmdbId: r.tmdbId,
                title: r.title,
                posterPath: r.posterPath,
                backdropPath: r.backdropPath,
                seasons: r.seasons,
                is4k: r.is4k,
                status: {
                  label: reviewedRequestLabel(t, r.status, r.manuallyApproved, removed),
                  className: reviewedPillClass(r.status, removed),
                },
                requestedBy: { name: r.requestedByName || r.requestedByUsername },
                requestedAt: r.createdAt,
                modifiedAt: r.reviewedAt,
                modifiedBy: reviewer ? { name: reviewer } : null,
                addedTo: r.status === "approved" && !r.manuallyApproved && !removed ? r.arrServerName : null,
                commentCount: requestComments.get(r.id) ?? 0,
                notes: (
                  <>
                    {reason && <p className="text-xs text-text-muted">{reasonText(t, reason)}</p>}
                    {r.status === "approved" && r.notFoundSince && (
                      <a href="#cant-find" className="inline-flex w-fit rounded-full bg-missing-bg px-2.5 py-0.5 text-[11.5px] font-medium text-missing">
                        {t("requests.cantFind")}
                      </a>
                    )}
                  </>
                ),
              };
              // Approved and still on the server: "Can't get it" declines it after all.
              return r.status === "approved" && !removed ? (
                <CantGetItRequestCard key={r.id} {...card} requesterName={card.requestedBy.name} />
              ) : (
                <RequestCard key={r.id} {...card} />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

type EveryoneRow = {
  id: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  posterPath: string | null;
  backdropPath?: string | null;
  seasons: number[] | null;
  is4k: boolean;
  status: RequestStatus;
  manuallyApproved: boolean;
  /** Approved, then removed from Sonarr/Radarr (null for pending ones). */
  removedAt?: Date | null;
  createdAt: Date;
  requestedByName: string | null;
  requestedByUsername: string;
};

/** "Everyone's requests" — what the rest of the household has asked for,
 * for someone with "See everyone's requests" who doesn't review them. */
function EveryonesRequests({ t, requests }: { t: Translator; requests: EveryoneRow[] }) {
  return (
    <>
      <h2 className="mt-12 font-display text-xl text-text-primary">{t("requests.everyonesRequests")}</h2>
      {requests.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">{t("requests.nobodyElseYet")}</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {requests.map((r) => (
            <RequestCard
              key={r.id}
              id={r.id}
              mediaType={r.mediaType}
              tmdbId={r.tmdbId}
              title={r.title}
              posterPath={r.posterPath}
              backdropPath={r.backdropPath}
              seasons={r.seasons}
              is4k={r.is4k}
              status={{
                label:
                  r.status === "pending"
                    ? t("requests.waitingForReview")
                    : reviewedRequestLabel(t, r.status, r.manuallyApproved, Boolean(r.removedAt)),
                className: r.status === "pending" ? "bg-info-bg text-info" : reviewedPillClass(r.status, Boolean(r.removedAt)),
              }}
              requestedBy={{ name: r.requestedByName || r.requestedByUsername }}
              requestedAt={r.createdAt}
            />
          ))}
        </div>
      )}
    </>
  );
}
