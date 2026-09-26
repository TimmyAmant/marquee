import { revalidatePathSafely as revalidatePath } from "@/lib/cache/revalidate";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requests, users } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import { getActiveRequestStatus, getViewerTitleRequests } from "@/lib/requests/query";
import { activityRequestTitle, quotedRequestTitle } from "@/lib/requests/labels";
import { parseSeasonsInput, seasonsStillNeeded, unlistedSeasonError } from "@/lib/requests/seasons";
import { addMovieToRadarrForUser, addSeriesToSonarrForUser, type AddPlacement } from "@/lib/arr/title-actions";
import { getLibraryOwnerUserId, type ViewerIdentity } from "@/lib/integrations/library-owner";
import { getSonarrSeasonStates, getTitleLibraryStatus } from "@/lib/integrations/status";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import type { TmdbTvDetails } from "@/lib/tmdb/client";
import { createNotification } from "@/lib/notifications/query";
import { logActivityEvent } from "@/lib/activity/query";
import { getAdminUserId } from "@/lib/auth/get-admin";
import { insertWithinQuota } from "@/lib/requests/quota";
import { clearRequestAlerts, notifyReviewersOfRequest, refreshRequestAlerts } from "@/lib/requests/alerts";
import { blockedMessage, findBlock } from "@/lib/requests/blocklist";
import { getFourKStatus, isFourKReady } from "@/lib/arr/fourk";
import { hasOverrides, type AddOverrides } from "@/lib/arr/add-options";
import { canReviewRequests } from "@/lib/users/roles";
import { checkRateLimit } from "@/lib/rate-limit";
import { fail, type CoreFailure, type CoreResult } from "@/lib/core-result";

// Request lifecycle shared by the web's server actions (lib/requests/actions.ts)
// and /api/v1/requests/*. Callers verify who is acting (signed in / admin);
// everything after that lives here.

export async function createRequest(
  viewer: Extract<ViewerIdentity, { userId: string }>,
  input: {
    mediaType: MediaType;
    tmdbId: number;
    title: string;
    posterPath: string | null;
    /** TV only, as the client sent it (validated here): a list of season
     * numbers, or omitted/null for the whole series. Ignored for movies. */
    seasons?: unknown;
    /** Ask for it in 4K (lib/arr/fourk.ts): only once the admin has set up
     * the 4K Sonarr/Radarr for this type. Always the whole title. */
    is4k?: unknown;
    /** Don't alert reviewers about this one: the Plex Watchlist sync sends
     * one alert for its whole batch instead (lib/requests/alerts.ts). */
    quiet?: boolean;
  },
): Promise<CoreResult<{ requestId: string }>> {
  const { mediaType, tmdbId } = input;
  // The admin's blocklist (lib/requests/blocklist.ts) — before anything else,
  // for 4K and Plex Watchlist requests alike.
  const block = await findBlock(mediaType, tmdbId);
  if (block) return fail("forbidden", blockedMessage(block));
  if (input.is4k === true) return createFourKRequest(viewer, input);

  const parsedSeasons = mediaType === "tv" ? parseSeasonsInput(input.seasons) : { ok: true as const, seasons: null };
  if (!parsedSeasons.ok) return fail("invalid", parsedSeasons.error);
  let seasons = parsedSeasons.seasons;

  // A season request is only blocked by one still waiting for approval —
  // asking for more seasons after an earlier request was approved is the
  // point. A whole-series request keeps its original rule: any request that
  // wasn't declined blocks another.
  if (seasons) {
    const pending = await getViewerTitleRequests(viewer.userId, mediaType, tmdbId);
    if (pending.some((r) => r.status === "pending")) {
      return fail("conflict", "You've already requested this — it's waiting for approval.");
    }
  } else {
    const existing = await getActiveRequestStatus(viewer.userId, mediaType, tmdbId);
    if (existing) return fail("conflict", "You've already requested this.");
  }

  // Defense in depth: the Request button is already hidden once a title
  // shows as owned, but re-check server-side since that status can change
  // between page load and submit (e.g. someone else just added it).
  const cachedTitle = await getOrFetchTitle(mediaType, tmdbId).catch(() => null);

  if (seasons) {
    // Checked against the server's own TMDb record, never the client's idea
    // of which seasons exist.
    if (!cachedTitle) return fail("upstream", "Couldn't check this show's seasons with TMDb right now.");
    const listed = ((cachedTitle.rawTmdb as TmdbTvDetails | null)?.seasons ?? []).map((s) => s.season_number);
    const unlisted = unlistedSeasonError(seasons, listed);
    if (unlisted) return fail("invalid", unlisted);

    // Unlike a whole-series request, this is fine for a show that's already
    // tracked or owned — only the seasons Sonarr already has covered drop out.
    const library = await getSonarrSeasonStates(viewer.libraryOwnerId, cachedTitle.tvdbId).catch(() => null);
    if (!library) {
      // Sonarr isn't tracking it, so there's no per-season detail: a show
      // that's in Plex or Jellyfin anyway is owned whole, and approving
      // seasons of it would only download them a second time.
      const status = await getTitleLibraryStatus(viewer.libraryOwnerId, mediaType, tmdbId, cachedTitle.tvdbId).catch(
        () => null,
      );
      if (status && status.status !== "untracked") {
        return fail("conflict", "You already have this in your library.");
      }
    }
    seasons = seasonsStillNeeded(seasons, library);
    if (seasons.length === 0) return fail("conflict", "Those seasons are already in your library or on their way.");
  }

  // The name and poster the admin's queue (and every notification relay)
  // shows come from the server's own TMDb record when it has one. The web
  // button binds them in the browser, so on their own they'd let a member
  // dress up one title as another; the client's values only stand in when
  // TMDb can't be reached, and then trimmed to something a row can hold.
  const fallbackTitle = typeof input.title === "string" ? input.title.trim().slice(0, 200) : "";
  const title = cachedTitle?.name ?? (fallbackTitle || "Untitled");
  const posterPath = cachedTitle
    ? cachedTitle.posterPath
    : typeof input.posterPath === "string" && /^(\/|https:\/\/)/.test(input.posterPath)
      ? input.posterPath.slice(0, 500)
      : null;
  if (!seasons) {
    const currentStatus = await getTitleLibraryStatus(
      viewer.libraryOwnerId,
      mediaType,
      tmdbId,
      cachedTitle?.tvdbId ?? null,
    ).catch(() => null);
    if (currentStatus && currentStatus.status !== "untracked") {
      return fail("conflict", "You already have this in your library.");
    }
  }

  // The read-then-write check above can't stop a second concurrent submit
  // (double-click, two tabs) from also passing it — requests_pending_unique_idx
  // is the actual guard; a 23505 here means we lost that race, not a real error.
  // The limit check and the insert happen under one lock per member and
  // type, so parallel requests can't all squeeze into the last slot.
  const within = await insertWithinQuota(viewer.userId, mediaType, () =>
    db
      .insert(requests)
      .values({
        requestedByUserId: viewer.userId,
        mediaType,
        tmdbId,
        title,
        posterPath,
        seasons,
      })
      .returning({ id: requests.id })
      .then(([row]) => row)
      .catch((err) => {
        if (err && typeof err === "object" && "code" in err && err.code === "23505") return null;
        throw err;
      }),
  );
  if (!within.ok) return fail("rate_limited", within.error);
  const inserted = within.value;
  if (!inserted) {
    return fail(
      "conflict",
      seasons ? "You've already requested this — it's waiting for approval." : "You've already requested this.",
    );
  }

  await logActivityEvent({
    actorUserId: viewer.userId,
    eventType: "request_created",
    mediaType,
    tmdbId,
    title: activityRequestTitle(title, seasons),
  }).catch(() => undefined);

  // Admin-set per member (Settings -> household member edit) — if this
  // media type is auto-approved for them, skip straight to the same
  // approval flow the admin's Approve button uses. Falls back to sitting
  // pending (like any failed manual approval) if it isn't set up, or under
  // "Couldn't add" — with the reviewers told — if Radarr is unreachable.
  const [requester] = await db
    .select({ role: users.role, autoApproveMovies: users.autoApproveMovies, autoApproveTv: users.autoApproveTv })
    .from(users)
    .where(eq(users.id, viewer.userId));
  // A trusted member's requests go straight through (lib/users/roles.ts).
  const autoApprove =
    requester?.role === "trusted" || (mediaType === "movie" ? requester?.autoApproveMovies : requester?.autoApproveTv);
  if (autoApprove) {
    const adminUserId = await getAdminUserId();
    if (adminUserId) {
      const approved = await approveRequest(inserted.id, adminUserId).catch(() => null);
      if (approved && "addFailed" in approved) await notifyReviewersOfAddFailure(inserted.id).catch(() => undefined);
    }
  }
  if (!input.quiet) await notifyReviewersOfRequest(inserted.id).catch(() => undefined);

  revalidatePath(`/title/${mediaType}/${tmdbId}`);
  revalidatePath("/requests");
  return { ok: true, requestId: inserted.id };
}

/** A 4K request: the whole title, checked against the 4K instance (not
 * the main library — owning it in HD is exactly why someone asks for 4K). */
async function createFourKRequest(
  viewer: Extract<ViewerIdentity, { userId: string }>,
  input: { mediaType: MediaType; tmdbId: number; title: string; posterPath: string | null },
): Promise<CoreResult<{ requestId: string }>> {
  const { mediaType, tmdbId } = input;
  const adminUserId = await getAdminUserId();
  if (!adminUserId || !(await isFourKReady(adminUserId, mediaType))) {
    return fail("conflict", "4K requests aren't set up on this server.");
  }
  if (await getActiveRequestStatus(viewer.userId, mediaType, tmdbId, true)) {
    return fail("conflict", "You've already requested this in 4K.");
  }
  const cachedTitle = await getOrFetchTitle(mediaType, tmdbId).catch(() => null);
  if (!cachedTitle) return fail("upstream", "Couldn't look this title up with TMDb right now.");
  const fourK = await getFourKStatus(adminUserId, mediaType, tmdbId, cachedTitle.tvdbId).catch(() => null);
  if (fourK && fourK.status !== "untracked") {
    return fail("conflict", "It's already in the 4K library or on its way.");
  }

  // The limit check and the insert happen under one lock per member and
  // type, so parallel requests can't all squeeze into the last slot.
  const within = await insertWithinQuota(viewer.userId, mediaType, () =>
    db
      .insert(requests)
      .values({
        requestedByUserId: viewer.userId,
        mediaType,
        tmdbId,
        title: cachedTitle.name,
        posterPath: cachedTitle.posterPath,
        seasons: null,
        is4k: true,
      })
      .returning({ id: requests.id })
      .then(([row]) => row)
      .catch((err) => {
        if (err && typeof err === "object" && "code" in err && err.code === "23505") return null;
        throw err;
      }),
  );
  if (!within.ok) return fail("rate_limited", within.error);
  const inserted = within.value;
  if (!inserted) return fail("conflict", "You've already requested this in 4K.");

  await logActivityEvent({
    actorUserId: viewer.userId,
    eventType: "request_created",
    mediaType,
    tmdbId,
    title: `${cachedTitle.name} in 4K`,
  }).catch(() => undefined);

  const [requester] = await db
    .select({ role: users.role, autoApproveMovies: users.autoApproveMovies, autoApproveTv: users.autoApproveTv })
    .from(users)
    .where(eq(users.id, viewer.userId));
  if (requester?.role === "trusted" || (mediaType === "movie" ? requester?.autoApproveMovies : requester?.autoApproveTv)) {
    const approved = await approveRequest(inserted.id, adminUserId).catch(() => null);
    if (approved && "addFailed" in approved) await notifyReviewersOfAddFailure(inserted.id).catch(() => undefined);
  }
  await notifyReviewersOfRequest(inserted.id).catch(() => undefined);

  revalidatePath(`/title/${mediaType}/${tmdbId}`);
  revalidatePath("/requests");
  return { ok: true, requestId: inserted.id };
}

/** Whose Sonarr/Radarr an approval uses: the reviewer's own when they're
 * the admin, otherwise (a trusted member) the admin's. */
async function credentialOwnerFor(reviewerUserId: string): Promise<string | null> {
  const [reviewer] = await db.select({ role: users.role }).from(users).where(eq(users.id, reviewerUserId)).limit(1);
  return reviewer?.role === "admin" ? reviewerUserId : getAdminUserId();
}

/** How a request is named in notifications and the activity feed. */
function requestName(request: { title: string; seasons: number[] | null; is4k: boolean }, quoted: boolean): string {
  const name = quoted ? quotedRequestTitle(request.title, request.seasons) : activityRequestTitle(request.title, request.seasons);
  return request.is4k ? `${name} in 4K` : name;
}


type RequestRow = typeof requests.$inferSelect;

/** An approval whose add Sonarr/Radarr didn't take (unreachable, or it
 * errored): the request is approved and listed under "Couldn't add". */
export type AddFailure = CoreFailure & { addFailed: true };

/** The line a reviewer sees when an approval ends under "Couldn't add". */
function couldntAddMessage(error: string): string {
  return `${error} It's approved and waiting under “Couldn't add” — retry once it's reachable.`;
}

/** Adds the request's title with the admin's Sonarr/Radarr. */
function addForRequest(adminUserId: string, request: RequestRow, overrides: AddOverrides) {
  return request.mediaType === "movie"
    ? addMovieToRadarrForUser(adminUserId, request.tmdbId, request.is4k, overrides)
    : addSeriesToSonarrForUser(adminUserId, request.tmdbId, request.seasons, true, request.is4k, overrides);
}

/** After the add went through: tell the requester, log it, refresh pages. */
async function announceApproval(request: RequestRow, reviewerUserId: string): Promise<void> {
  await clearRequestAlerts(request.id).catch(() => undefined);
  await Promise.all([
    createNotification({
      userId: request.requestedByUserId,
      mediaType: request.mediaType,
      tmdbId: request.tmdbId,
      title: request.title,
      eventType: "request_approved",
      message: `${requestName(request, true)} was approved — it's on its way to your library.`,
      is4k: request.is4k,
    }).catch(() => undefined),
    logActivityEvent({
      actorUserId: reviewerUserId,
      eventType: "request_approved",
      mediaType: request.mediaType,
      tmdbId: request.tmdbId,
      title: requestName(request, false),
    }).catch(() => undefined),
  ]);
  revalidatePath(`/title/${request.mediaType}/${request.tmdbId}`);
  revalidatePath("/discover");
  revalidatePath("/requests");
}

function placementColumns(placement: AddPlacement) {
  return {
    arrServerId: placement.serverId,
    arrServerName: placement.serverName,
    arrQualityProfileId: placement.qualityProfileId,
    arrRootFolderPath: placement.rootFolderPath,
    arrTags: placement.tags,
    arrSeriesType: placement.seriesType,
  };
}

/** Shared by the single-request Approve button and "Approve all" — takes an
 * already-verified reviewer (the admin or a trusted member) so the bulk path
 * doesn't re-check on every iteration. The title is added with the admin's
 * Sonarr/Radarr either way.
 *
 * The request is claimed first (pending → approved in one guarded update),
 * so the requester can't cancel or change it while it's being added. If
 * Sonarr/Radarr can't be reached or errors, it stays approved under
 * "Couldn't add" with the error, for a reviewer to retry. Anything else
 * (not set up, a show Sonarr can't resolve, bad Advanced picks) puts it back
 * in the queue, as it always was. */
export async function approveRequest(
  requestId: string,
  reviewerUserId: string,
  /** The reviewer's "Advanced" picks (lib/arr/add-options.ts): which server
   * and with what. None = the server's defaults, as it always was. */
  overrides: AddOverrides = {},
): Promise<CoreResult | AddFailure> {
  const adminUserId = await credentialOwnerFor(reviewerUserId);
  if (!adminUserId) return fail("conflict", "There's no admin account to add titles with.");

  const claimedAt = new Date();
  const [request] = await db
    .update(requests)
    .set({
      status: "approved",
      reviewedByUserId: reviewerUserId,
      reviewedAt: claimedAt,
      addOverrides: hasOverrides(overrides) ? overrides : null,
    })
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")))
    .returning();
  if (!request) return fail("not_found", "Request not found or already reviewed.");

  // Executes using the approving admin's own Sonarr/Radarr credential —
  // there's no shared/instance-wide credential, only per-user ones.
  const result = await addForRequest(adminUserId, request, overrides);
  if (!result.ok) {
    if (result.code === "upstream") {
      await markAddFailed(request.id, result.error, claimedAt);
      return { ...fail("upstream", couldntAddMessage(result.error)), addFailed: true };
    }
    const reverted = await db
      .update(requests)
      .set({ status: "pending", reviewedByUserId: null, reviewedAt: null, addOverrides: null })
      .where(and(eq(requests.id, requestId), eq(requests.status, "approved"), eq(requests.reviewedAt, claimedAt)))
      .returning({ id: requests.id })
      .catch((err) => {
        // A new request for more seasons went in meanwhile, and only one may
        // wait at a time: keep this one where a reviewer will see it.
        if (err && typeof err === "object" && "code" in err && err.code === "23505") return null;
        throw err;
      });
    if (reverted === null) await markAddFailed(request.id, result.error, claimedAt);
    return result;
  }

  // Where it went and with what (`addedTo` in /requests/history).
  await db
    .update(requests)
    .set(placementColumns(result.placement))
    .where(eq(requests.id, requestId));
  await announceApproval(request, reviewerUserId);
  return { ok: true };
}

async function markAddFailed(requestId: string, error: string, since: Date): Promise<void> {
  await db
    .update(requests)
    .set({ addFailedAt: since, addError: error })
    .where(and(eq(requests.id, requestId), eq(requests.status, "approved")));
  // Its "new request" alerts have done their job either way.
  await clearRequestAlerts(requestId).catch(() => undefined);
  revalidatePath("/requests");
}

/** "Retry" on a request under "Couldn't add": the add again, with the
 * Advanced picks it was approved with, or new ones when sent. Two retries
 * at once can't both run: the first claims it. */
export async function retryRequest(
  requestId: string,
  reviewerUserId: string,
  overrides?: AddOverrides,
): Promise<CoreResult> {
  const adminUserId = await credentialOwnerFor(reviewerUserId);
  if (!adminUserId) return fail("conflict", "There's no admin account to add titles with.");
  const [request] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.status, "approved"), isNotNull(requests.addFailedAt)))
    .limit(1);
  if (!request || !request.addFailedAt) return fail("not_found", "That request isn't waiting to be added any more.");

  const picks = overrides && hasOverrides(overrides) ? overrides : (request.addOverrides ?? {});
  const claimedAt = new Date();
  const [claimed] = await db
    .update(requests)
    .set({ addFailedAt: claimedAt, addOverrides: hasOverrides(picks) ? picks : null })
    .where(
      and(eq(requests.id, requestId), eq(requests.status, "approved"), eq(requests.addFailedAt, request.addFailedAt)),
    )
    .returning({ id: requests.id });
  if (!claimed) return fail("conflict", "Someone's already retrying it.");

  const result = await addForRequest(adminUserId, request, picks);
  if (!result.ok) {
    await db
      .update(requests)
      .set({ addError: result.error })
      .where(and(eq(requests.id, requestId), eq(requests.addFailedAt, claimedAt)));
    revalidatePath("/requests");
    return result;
  }
  const [done] = await db
    .update(requests)
    .set({ ...placementColumns(result.placement), addFailedAt: null, addError: null, reviewedByUserId: reviewerUserId })
    .where(and(eq(requests.id, requestId), eq(requests.status, "approved"), eq(requests.addFailedAt, claimedAt)))
    .returning({ id: requests.id });
  if (!done) return fail("conflict", "That request changed while it was being added.");
  await announceApproval(request, reviewerUserId);
  return { ok: true };
}

/** Tells the reviewers an automatic approval (a trusted member's, or a
 * member set to auto-approve) couldn't be added — otherwise nobody would
 * know it's sitting under "Couldn't add". */
async function notifyReviewersOfAddFailure(requestId: string): Promise<void> {
  const [request] = await db
    .select({
      addFailedAt: requests.addFailedAt,
      addError: requests.addError,
      mediaType: requests.mediaType,
      tmdbId: requests.tmdbId,
      title: requests.title,
      seasons: requests.seasons,
      is4k: requests.is4k,
      requesterId: requests.requestedByUserId,
      requesterName: users.displayName,
      requesterUsername: users.username,
    })
    .from(requests)
    .innerJoin(users, eq(users.id, requests.requestedByUserId))
    .where(eq(requests.id, requestId))
    .limit(1);
  if (!request?.addFailedAt) return;
  const reviewers = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(inArray(users.role, ["admin", "trusted"]));
  reviewers.sort((a, b) => (a.role === "admin" ? -1 : b.role === "admin" ? 1 : 0));
  const who = request.requesterName || request.requesterUsername;
  const what = requestName(request, true);
  for (const [index, reviewer] of reviewers.entries()) {
    await createNotification({
      userId: reviewer.id,
      mediaType: request.mediaType,
      tmdbId: request.tmdbId,
      title: request.title,
      eventType: "request_created",
      message: `${who}'s request for ${what} was approved, but couldn't be added: ${request.addError ?? "the server didn't take it."} Retry it on the Requests page.`,
      is4k: request.is4k,
      relay: index === 0,
    }).catch(() => undefined);
  }
}

export type ApproveAllResult = {
  approvedCount: number;
  failedCount: number;
  firstError: string | null;
  firstFailure: CoreFailure | null;
};

/** Approves every currently pending request in one pass, sequentially (not
 * Promise.all) so a burst of requests doesn't hammer Radarr/Sonarr with
 * simultaneous add calls. Requests that fail are left pending, or (Sonarr/
 * Radarr unreachable partway through) under "Couldn't add" — never dropped. */
export async function approveAllRequests(adminUserId: string): Promise<ApproveAllResult> {
  const pending = await db.select({ id: requests.id }).from(requests).where(eq(requests.status, "pending"));

  let approvedCount = 0;
  const failures: CoreFailure[] = [];
  for (const { id } of pending) {
    const result = await approveRequest(id, adminUserId);
    if (result.ok) {
      approvedCount++;
    } else {
      failures.push({ ok: false, code: result.code, error: result.error });
    }
  }

  revalidatePath("/requests");
  return {
    approvedCount,
    failedCount: failures.length,
    firstError: failures[0]?.error ?? null,
    firstFailure: failures[0] ?? null,
  };
}

/** Still waiting for a review — or approved but never added ("Couldn't
 * add"), which a reviewer may also decline or mark as added by hand. */
const reviewable = or(
  eq(requests.status, "pending"),
  and(eq(requests.status, "approved"), isNotNull(requests.addFailedAt)),
);

/** For requests Sonarr/Radarr can't add automatically (e.g. no TVDB id to
 * resolve) but the admin is downloading by hand anyway. Marks the request
 * approved without touching Sonarr/Radarr, and flags it so the requester
 * sees "Manually approved" instead of the normal approved status. */
export async function manuallyApproveRequest(requestId: string, adminUserId: string): Promise<CoreResult> {
  const [request] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, requestId), reviewable));
  if (!request) return fail("not_found", "Request not found or already reviewed.");

  const [updated] = await db
    .update(requests)
    .set({
      status: "approved",
      manuallyApproved: true,
      reviewedByUserId: adminUserId,
      reviewedAt: new Date(),
      addFailedAt: null,
      addError: null,
    })
    .where(and(eq(requests.id, requestId), reviewable))
    .returning({ id: requests.id });
  if (!updated) return fail("conflict", "Request was already reviewed.");
  await clearRequestAlerts(requestId).catch(() => undefined);

  await Promise.all([
    createNotification({
      userId: request.requestedByUserId,
      mediaType: request.mediaType,
      tmdbId: request.tmdbId,
      title: request.title,
      eventType: "request_approved",
      message: `${requestName(request, true)} was manually approved — the admin is adding it outside of Sonarr/Radarr.`,
    }).catch(() => undefined),
    logActivityEvent({
      actorUserId: adminUserId,
      eventType: "request_manually_approved",
      mediaType: request.mediaType,
      tmdbId: request.tmdbId,
      title: requestName(request, false),
    }).catch(() => undefined),
  ]);

  revalidatePath(`/title/${request.mediaType}/${request.tmdbId}`);
  revalidatePath("/requests");
  return { ok: true };
}

/** `reason` is already normalized by the caller (lib/requests/rejection-reasons.ts)
 * and optional: the web form always sends one, but an older API client may
 * not, and a plain "was declined." is still better than refusing the reject. */
export async function rejectRequest(
  requestId: string,
  adminUserId: string,
  reason: string | null = null,
): Promise<CoreResult> {
  const [request] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, requestId), reviewable));
  if (!request) return fail("not_found", "Request not found or already reviewed.");

  // Same atomic re-guard as approveRequest — see comment there.
  const [updated] = await db
    .update(requests)
    .set({
      status: "rejected",
      rejectionReason: reason,
      reviewedByUserId: adminUserId,
      reviewedAt: new Date(),
      addFailedAt: null,
      addError: null,
    })
    .where(and(eq(requests.id, requestId), reviewable))
    .returning({ id: requests.id });
  if (!updated) return fail("conflict", "Request was already reviewed.");
  await clearRequestAlerts(requestId).catch(() => undefined);

  await Promise.all([
    createNotification({
      userId: request.requestedByUserId,
      mediaType: request.mediaType,
      tmdbId: request.tmdbId,
      title: request.title,
      eventType: "request_rejected",
      // The reason rides along in the notification too, so the requester
      // hears why without having to open their Requests page.
      message: reason
        ? `${requestName(request, true)} was declined: ${reason}`
        : `${requestName(request, true)} was declined.`,
    }).catch(() => undefined),
    logActivityEvent({
      actorUserId: adminUserId,
      eventType: "request_rejected",
      mediaType: request.mediaType,
      tmdbId: request.tmdbId,
      title: requestName(request, false),
    }).catch(() => undefined),
  ]);

  revalidatePath("/requests");
  return { ok: true };
}

// ── Changing your mind ───────────────────────────────────────────────────

export type RequestActor = { userId: string; role: string | null | undefined };

/** Cancels one of your own requests while it's still waiting for review:
 * it's gone, its slot in your request limit is free again, and the
 * reviewers' alerts about it are cleared. Once reviewed, it can't be
 * cancelled here — ask in its comments instead. */
export async function cancelRequest(actor: RequestActor, requestId: string): Promise<CoreResult> {
  const [request] = await db
    .select({
      id: requests.id,
      status: requests.status,
      ownerId: requests.requestedByUserId,
      mediaType: requests.mediaType,
      tmdbId: requests.tmdbId,
    })
    .from(requests)
    .where(eq(requests.id, requestId))
    .limit(1);
  // Someone else's request reads like one that isn't there, unless you
  // review requests (then Decline is the way).
  if (!request || (request.ownerId !== actor.userId && !canReviewRequests(actor.role))) {
    return fail("not_found", "Request not found.");
  }
  if (request.ownerId !== actor.userId) return fail("forbidden", "Only whoever asked can cancel it — decline it instead.");
  if (request.status !== "pending") {
    return fail("conflict", "It's already been reviewed, so it can't be cancelled. Ask in its comments instead.");
  }
  if (!checkRateLimit(`request-cancel:${actor.userId}`, CANCELS_PER_HOUR, 60 * 60 * 1000)) {
    return fail("rate_limited", "That's a lot of cancelled requests in a short time. Try again in a while.");
  }

  // The alerts first: once the row is gone they no longer point at it.
  await clearRequestAlerts(requestId).catch(() => undefined);
  const deleted = await db
    .delete(requests)
    .where(and(eq(requests.id, requestId), eq(requests.requestedByUserId, actor.userId), eq(requests.status, "pending")))
    .returning({ id: requests.id });
  if (deleted.length === 0) {
    return fail("conflict", "It's already been reviewed, so it can't be cancelled. Ask in its comments instead.");
  }
  revalidatePath(`/title/${request.mediaType}/${request.tmdbId}`);
  revalidatePath("/requests");
  return { ok: true };
}

/** Cancelled requests one person may make in an hour — each one clears and
 * re-sends reviewer alerts when asked again. */
const CANCELS_PER_HOUR = 30;

/**
 * Changes a request still waiting for review: which seasons (TV), and
 * whether it's for the 4K copy. Its requester may change their own; a
 * reviewer may change anyone's before approving. The same checks as asking
 * afresh apply (seasons TMDb lists and Sonarr doesn't already have, 4K set
 * up and free, no duplicate). It keeps its place in the queue and in the
 * requester's request limit.
 */
export async function editRequest(
  actor: RequestActor,
  requestId: string,
  input: { seasons?: unknown; is4k?: unknown },
): Promise<CoreResult> {
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);
  const reviewer = canReviewRequests(actor.role);
  if (!request || (request.requestedByUserId !== actor.userId && !reviewer)) {
    return fail("not_found", "Request not found.");
  }
  if (request.status !== "pending") {
    return fail("conflict", "It's already been reviewed, so it can't be changed. Ask in its comments instead.");
  }
  if (input.is4k !== undefined && typeof input.is4k !== "boolean") return fail("invalid", '"is4k" must be true or false.');
  const is4k = input.is4k ?? request.is4k;

  let seasons: number[] | null;
  if (request.mediaType === "movie" || is4k) {
    // A 4K request is always the whole title.
    if (input.seasons !== undefined && input.seasons !== null) {
      return fail("invalid", request.mediaType === "movie" ? "A movie has no seasons." : "A 4K request is always the whole show.");
    }
    seasons = null;
  } else if (input.seasons === undefined) {
    seasons = request.seasons;
  } else {
    const parsed = parseSeasonsInput(input.seasons);
    if (!parsed.ok) return fail("invalid", parsed.error);
    seasons = parsed.seasons;
  }

  const sameSeasons = JSON.stringify(seasons) === JSON.stringify(request.seasons);
  if (is4k === request.is4k && sameSeasons) return { ok: true };

  const libraryOwnerId = await getLibraryOwnerUserId(request.requestedByUserId);
  const checked = is4k
    ? await checkFourKEdit(request)
    : await checkRegularEdit(request, seasons, libraryOwnerId);
  if (!checked.ok) return checked;
  seasons = checked.seasons;

  const updated = await db
    .update(requests)
    .set({ is4k, seasons, editedAt: new Date() })
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")))
    .returning()
    .catch((err) => {
      if (err && typeof err === "object" && "code" in err && err.code === "23505") return null;
      throw err;
    });
  if (updated === null) {
    return fail("conflict", is4k ? "There's already a 4K request for this waiting." : "There's already a request for this waiting.");
  }
  if (updated.length === 0) {
    return fail("conflict", "It's already been reviewed, so it can't be changed. Ask in its comments instead.");
  }
  // The reviewers' "new request" alerts still waiting name what's asked for.
  await refreshRequestAlerts(updated[0]).catch(() => undefined);
  revalidatePath(`/title/${request.mediaType}/${request.tmdbId}`);
  revalidatePath("/requests");
  return { ok: true };
}

type EditCheck = { ok: true; seasons: number[] | null } | CoreFailure;

async function checkFourKEdit(request: RequestRow): Promise<EditCheck> {
  const adminUserId = await getAdminUserId();
  if (!adminUserId || !(await isFourKReady(adminUserId, request.mediaType))) {
    return fail("conflict", "4K requests aren't set up on this server.");
  }
  if (await getActiveRequestStatus(request.requestedByUserId, request.mediaType, request.tmdbId, true)) {
    return fail("conflict", "There's already a 4K request for this.");
  }
  const cachedTitle = await getOrFetchTitle(request.mediaType, request.tmdbId).catch(() => null);
  if (!cachedTitle) return fail("upstream", "Couldn't look this title up with TMDb right now.");
  const fourK = await getFourKStatus(adminUserId, request.mediaType, request.tmdbId, cachedTitle.tvdbId).catch(() => null);
  if (fourK && fourK.status !== "untracked") return fail("conflict", "It's already in the 4K library or on its way.");
  return { ok: true, seasons: null };
}

async function checkRegularEdit(request: RequestRow, seasons: number[] | null, libraryOwnerId: string): Promise<EditCheck> {
  const { mediaType, tmdbId } = request;
  if (request.is4k) {
    // Coming off 4K: the regular request mustn't already exist.
    const existing = await getActiveRequestStatus(request.requestedByUserId, mediaType, tmdbId, false);
    if (existing) return fail("conflict", "There's already a request for this.");
  }
  const cachedTitle = await getOrFetchTitle(mediaType, tmdbId).catch(() => null);
  if (seasons) {
    if (!cachedTitle) return fail("upstream", "Couldn't check this show's seasons with TMDb right now.");
    const listed = ((cachedTitle.rawTmdb as TmdbTvDetails | null)?.seasons ?? []).map((s) => s.season_number);
    const unlisted = unlistedSeasonError(seasons, listed);
    if (unlisted) return fail("invalid", unlisted);
    const library = await getSonarrSeasonStates(libraryOwnerId, cachedTitle.tvdbId).catch(() => null);
    const needed = seasonsStillNeeded(seasons, library);
    if (needed.length === 0) return fail("conflict", "Those seasons are already in your library or on their way.");
    return { ok: true, seasons: needed };
  }
  const status = await getTitleLibraryStatus(libraryOwnerId, mediaType, tmdbId, cachedTitle?.tvdbId ?? null).catch(
    () => null,
  );
  // The same rule as asking for the whole title afresh.
  if (status && status.status !== "untracked") {
    return fail("conflict", "You already have this in your library.");
  }
  return { ok: true, seasons: null };
}
