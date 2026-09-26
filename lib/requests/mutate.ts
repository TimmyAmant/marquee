import { revalidatePathSafely as revalidatePath } from "@/lib/cache/revalidate";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requests, users } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import { getActiveRequestStatus, getViewerTitleRequests } from "@/lib/requests/query";
import { activityRequestTitle, quotedRequestTitle } from "@/lib/requests/labels";
import { parseSeasonsInput, seasonsStillNeeded, unlistedSeasonError } from "@/lib/requests/seasons";
import { addMovieToRadarrForUser, addSeriesToSonarrForUser } from "@/lib/arr/title-actions";
import type { ViewerIdentity } from "@/lib/integrations/library-owner";
import { getSonarrSeasonStates, getTitleLibraryStatus } from "@/lib/integrations/status";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import type { TmdbTvDetails } from "@/lib/tmdb/client";
import { createNotification } from "@/lib/notifications/query";
import { logActivityEvent } from "@/lib/activity/query";
import { getAdminUserId } from "@/lib/auth/get-admin";
import { insertWithinQuota } from "@/lib/requests/quota";
import { notifyReviewersOfRequest } from "@/lib/requests/alerts";
import { blockedMessage, findBlock } from "@/lib/requests/blocklist";
import { getFourKStatus, isFourKReady } from "@/lib/arr/fourk";
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
  // pending (like any failed manual approval) if it errors, e.g. Radarr
  // unreachable or the admin hasn't configured it yet.
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
      await approveRequest(inserted.id, adminUserId).catch(() => undefined);
    }
  }
  await notifyReviewersOfRequest(inserted.id).catch(() => undefined);

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
    await approveRequest(inserted.id, adminUserId).catch(() => undefined);
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

/** Shared by the single-request Approve button and "Approve all" — takes an
 * already-verified reviewer (the admin or a trusted member) so the bulk path
 * doesn't re-check on every iteration. The title is added with the admin's
 * Sonarr/Radarr either way. */
export async function approveRequest(requestId: string, reviewerUserId: string): Promise<CoreResult> {
  const adminUserId = await credentialOwnerFor(reviewerUserId);
  if (!adminUserId) return fail("conflict", "There's no admin account to add titles with.");
  const [request] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")));
  if (!request) return fail("not_found", "Request not found or already reviewed.");

  // Executes using the approving admin's own Sonarr/Radarr credential —
  // there's no shared/instance-wide credential, only per-user ones.
  const result =
    request.mediaType === "movie"
      ? await addMovieToRadarrForUser(adminUserId, request.tmdbId, request.is4k)
      : await addSeriesToSonarrForUser(adminUserId, request.tmdbId, request.seasons, true, request.is4k);

  if (!result.ok) return result;

  // Re-guard on status='pending' here too — the initial select above can't
  // stop a concurrent reject from landing between that read and this write,
  // so keep the same atomic "only if still pending" condition the original
  // single UPDATE...WHERE had before this was split into select-then-update.
  const [updated] = await db
    .update(requests)
    .set({ status: "approved", reviewedByUserId: reviewerUserId, reviewedAt: new Date() })
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")))
    .returning({ id: requests.id });
  if (!updated) return fail("conflict", "Request was already reviewed.");

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
  return { ok: true };
}

export type ApproveAllResult = {
  approvedCount: number;
  failedCount: number;
  firstError: string | null;
  firstFailure: CoreFailure | null;
};

/** Approves every currently pending request in one pass, sequentially (not
 * Promise.all) so a burst of requests doesn't hammer Radarr/Sonarr with
 * simultaneous add calls. Requests that fail (e.g. Radarr unreachable
 * partway through) are left pending rather than silently dropped. */
export async function approveAllRequests(adminUserId: string): Promise<ApproveAllResult> {
  const pending = await db.select({ id: requests.id }).from(requests).where(eq(requests.status, "pending"));

  let approvedCount = 0;
  const failures: CoreFailure[] = [];
  for (const { id } of pending) {
    const result = await approveRequest(id, adminUserId);
    if (result.ok) {
      approvedCount++;
    } else {
      failures.push(result);
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

/** For requests Sonarr/Radarr can't add automatically (e.g. no TVDB id to
 * resolve) but the admin is downloading by hand anyway. Marks the request
 * approved without touching Sonarr/Radarr, and flags it so the requester
 * sees "Manually approved" instead of the normal approved status. */
export async function manuallyApproveRequest(requestId: string, adminUserId: string): Promise<CoreResult> {
  const [request] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")));
  if (!request) return fail("not_found", "Request not found or already reviewed.");

  const [updated] = await db
    .update(requests)
    .set({
      status: "approved",
      manuallyApproved: true,
      reviewedByUserId: adminUserId,
      reviewedAt: new Date(),
    })
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")))
    .returning({ id: requests.id });
  if (!updated) return fail("conflict", "Request was already reviewed.");

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
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")));
  if (!request) return fail("not_found", "Request not found or already reviewed.");

  // Same atomic re-guard as approveRequest — see comment there.
  const [updated] = await db
    .update(requests)
    .set({ status: "rejected", rejectionReason: reason, reviewedByUserId: adminUserId, reviewedAt: new Date() })
    .where(and(eq(requests.id, requestId), eq(requests.status, "pending")))
    .returning({ id: requests.id });
  if (!updated) return fail("conflict", "Request was already reviewed.");

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
