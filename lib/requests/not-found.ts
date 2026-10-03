import { and, count, desc, eq, gte, isNotNull, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { getAdminUserId } from "@/lib/auth/get-admin";
import { appSettings, notifications, requests, titles, users } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import { fail, type CoreResult } from "@/lib/core-result";
import { mapWithLimit } from "@/lib/async/map-limit";
import { arrConfig, getArrServerById, getDefaultArrServer, type ArrServer } from "@/lib/arr/servers";
import { arrLinkBase } from "@/lib/arr/links";
import * as radarr from "@/lib/radarr/client";
import * as sonarr from "@/lib/sonarr/client";
import { getPlexFileInfo } from "@/lib/plex/sync";
import { getJellyfinFileInfo } from "@/lib/jellyfin/sync";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { createNotification } from "@/lib/notifications/query";
import { seasonsLabel } from "@/lib/requests/labels";
import { getT } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n/translator";
import {
  arrTitleUrl,
  decideNotFound,
  notFoundAfterHours,
  notFoundName,
  observeMovie,
  observeSeries,
  parseNotFoundAfterHours,
  type NotFoundObservation,
} from "@/lib/requests/not-found-rules";
import { usersWhoCan } from "@/lib/users/access";
import { can } from "@/lib/users/permissions";

// "Can't find" (the not-found-check job, lib/jobs/registry.ts): approved
// requests Sonarr/Radarr still has nothing for — released, monitored, no
// file, nothing downloading — a while after approval. The reviewers hear
// about it once (and once more a week later if it's still missing), the
// Requests page lists it until something turns up or a reviewer dismisses
// it, and a Grab from Sonarr/Radarr's webhook clears it straight away.
// The rules themselves are in lib/requests/not-found-rules.ts.

/** Each check is a live call to the admin's Sonarr/Radarr. */
const CHECK_CONCURRENCY = 4;

/** Requests approved longer ago than this aren't checked unless they're
 * already listed: by then it either turned up long ago or was flagged. */
const CHECK_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

// ── Settings ─────────────────────────────────────────────────────────────

export async function getNotFoundAfterHours(): Promise<number> {
  const [row] = await db.select({ hours: appSettings.notFoundAfterHours }).from(appSettings).limit(1);
  return notFoundAfterHours(row?.hours);
}

export async function saveNotFoundAfterHours(value: unknown): Promise<CoreResult<{ afterHours: number }>> {
  const parsed = parseNotFoundAfterHours(await getT(), value);
  if (!parsed.ok) return fail("invalid", parsed.error);
  const [existing] = await db.select({ id: appSettings.id }).from(appSettings).limit(1);
  if (existing) {
    await db
      .update(appSettings)
      .set({ notFoundAfterHours: parsed.hours, updatedAt: new Date() })
      .where(eq(appSettings.id, existing.id));
  } else {
    await db.insert(appSettings).values({ notFoundAfterHours: parsed.hours });
  }
  return { ok: true, afterHours: parsed.hours };
}

/** The wait, in ms. */
async function waitMs(): Promise<number> {
  return (await getNotFoundAfterHours()) * 3_600_000;
}

// ── Finding the server a request went to ────────────────────────────────

/** The server approving it added the title to; for a request approved
 * before servers were recorded (or whose server was removed), the default
 * one of its kind and 4K-ness. */
async function serverFor(
  row: { arrServerId: string | null; mediaType: MediaType; is4k: boolean },
  owner: string | null,
): Promise<ArrServer | null> {
  if (row.arrServerId) {
    const server = await getArrServerById(row.arrServerId).catch(() => null);
    if (server) return server;
  }
  if (!owner) return null;
  return getDefaultArrServer(owner, row.mediaType === "movie" ? "radarr" : "sonarr", row.is4k).catch(() => null);
}

type Candidate = {
  id: string;
  mediaType: MediaType;
  tmdbId: number;
  tvdbId: number | null;
  title: string;
  seasons: number[] | null;
  is4k: boolean;
  reviewedAt: Date | null;
  requesterId: string;
  requesterRole: string;
  requesterPermissions: string[];
  requesterName: string | null;
  requesterUsername: string;
  arrServerId: string | null;
  since: Date | null;
  alerts: number;
  alertedAt: Date | null;
  dismissedAt: Date | null;
  arrPath: string | null;
};

/** One run's queue lookups, once per server however many requests use it. */
function queueCache() {
  const queues = new Map<string, Promise<Set<number> | null>>();
  return (server: ArrServer): Promise<Set<number> | null> => {
    let queue = queues.get(server.id);
    if (!queue) {
      const config = arrConfig(server);
      // Any record counts, a finished download included: a release was found.
      queue = (server.kind === "radarr" ? radarr.getQueueSummaries(config) : sonarr.getQueueSummaries(config))
        .then((summaries) => new Set(summaries.keys()))
        .catch(() => null);
      queues.set(server.id, queue);
    }
    return queue;
  };
}

/** What the request's server says right now. Anything that goes wrong is
 * `unknown`: a server that's down mustn't flag (or clear) anything. */
async function observe(
  row: Candidate,
  server: ArrServer | null,
  owner: string | null,
  queued: (server: ArrServer) => Promise<Set<number> | null>,
): Promise<NotFoundObservation> {
  if (!server) return { kind: "unknown" };
  try {
    const config = arrConfig(server);
    if (row.mediaType === "movie") {
      // Already in Plex or Jellyfin counts as found, whatever Radarr thinks —
      // but only for the regular copy: a 4K request wants the 4K file.
      if (!row.is4k && owner) {
        const [plex, jellyfin] = await Promise.all([
          getPlexFileInfo(owner, "movie", row.tmdbId, null).catch(() => null),
          getJellyfinFileInfo(owner, "movie", row.tmdbId, null).catch(() => null),
        ]);
        if (plex || jellyfin) return { kind: "found" };
      }
      const movie = await radarr.getMovieByTmdbId(config, row.tmdbId);
      if (!movie) return { kind: "unknown" };
      const queue = await queued(server);
      if (queue === null) return { kind: "unknown" };
      return observeMovie(movie, queue.has(movie.id));
    }
    let tvdbId = row.tvdbId;
    if (!tvdbId) tvdbId = (await getOrFetchTitle("tv", row.tmdbId).catch(() => null))?.tvdbId ?? null;
    if (!tvdbId) return { kind: "unknown" };
    const series = await sonarr.getSeriesByTvdbId(config, tvdbId);
    if (!series) return { kind: "unknown" };
    const queue = await queued(server);
    if (queue === null) return { kind: "unknown" };
    return observeSeries(series, queue.has(series.id), row.seasons);
  } catch {
    return { kind: "unknown" };
  }
}

// ── The job ──────────────────────────────────────────────────────────────

/** The not-found-check job: every approved request past the wait that
 * isn't dismissed, asked of its Sonarr/Radarr. */
export async function checkNotFoundRequests(now = new Date()): Promise<void> {
  const wait = await waitMs();
  const rows: Candidate[] = await db
    .select({
      id: requests.id,
      mediaType: requests.mediaType,
      tmdbId: requests.tmdbId,
      tvdbId: titles.tvdbId,
      title: requests.title,
      seasons: requests.seasons,
      is4k: requests.is4k,
      reviewedAt: requests.reviewedAt,
      requesterId: requests.requestedByUserId,
      requesterRole: users.role,
      requesterPermissions: users.permissions,
      requesterName: users.displayName,
      requesterUsername: users.username,
      arrServerId: requests.arrServerId,
      since: requests.notFoundSince,
      alerts: requests.notFoundAlerts,
      alertedAt: requests.notFoundAlertedAt,
      dismissedAt: requests.notFoundDismissedAt,
      arrPath: requests.notFoundArrPath,
    })
    .from(requests)
    .innerJoin(users, eq(users.id, requests.requestedByUserId))
    .leftJoin(titles, and(eq(titles.mediaType, requests.mediaType), eq(titles.tmdbId, requests.tmdbId)))
    .where(
      and(
        eq(requests.status, "approved"),
        // Taken off Sonarr/Radarr again on purpose (lib/arr/remove.ts).
        isNull(requests.removedAt),
        // Approved by hand: the admin is getting it outside Sonarr/Radarr.
        eq(requests.manuallyApproved, false),
        // Never added ("Couldn't add"): nothing to look for yet.
        isNull(requests.addFailedAt),
        isNull(requests.notFoundDismissedAt),
        isNotNull(requests.reviewedAt),
        lte(requests.reviewedAt, new Date(now.getTime() - wait)),
        or(gte(requests.reviewedAt, new Date(now.getTime() - CHECK_WINDOW_MS)), isNotNull(requests.notFoundSince)),
      ),
    );
  if (rows.length === 0) return;

  const owner = await getAdminUserId();
  const queued = queueCache();
  const years = new Map<string, number | null>();

  await mapWithLimit(rows, CHECK_CONCURRENCY, async (row) => {
    const server = await serverFor(row, owner);
    const observation = await observe(row, server, owner, queued);
    const decision = decideNotFound(
      { since: row.since, alerts: row.alerts, alertedAt: row.alertedAt, dismissedAt: row.dismissedAt },
      observation,
      { now, reviewedAt: row.reviewedAt, waitMs: wait },
    );
    const arrPath = observation.kind === "missing" ? (observation.arrPath ?? row.arrPath) : row.arrPath;
    if (!decision.changed && arrPath === row.arrPath) return;

    await db
      .update(requests)
      .set({
        notFoundSince: decision.state.since,
        notFoundAlerts: decision.state.alerts,
        notFoundAlertedAt: decision.state.alertedAt,
        notFoundArrPath: arrPath,
      })
      .where(and(eq(requests.id, row.id), isNull(requests.notFoundDismissedAt)));

    if (decision.cleared) await clearNotFoundAlerts(row.id);
    if (decision.alert && observation.kind === "missing") {
      const key = `${row.mediaType}:${row.tmdbId}`;
      if (!years.has(key)) years.set(key, await releaseYear(row.mediaType, row.tmdbId));
      await notifyNotFound(row, observation.seasons, years.get(key) ?? null, decision.state.alerts > 1).catch((err) => {
        console.error("[not-found-check] notifying failed:", err);
      });
    }
  });
}

async function releaseYear(mediaType: MediaType, tmdbId: number): Promise<number | null> {
  const title = await getOrFetchTitle(mediaType, tmdbId).catch(() => null);
  const date = mediaType === "movie" ? title?.releaseDate : title?.firstAirDate;
  const year = date ? Number(String(date).slice(0, 4)) : NaN;
  return Number.isFinite(year) ? year : null;
}

/** Reviewers, the admin first — the admin's copy is the one relayed to the
 * household channels, so those hear about it once. */
function reviewers() {
  return usersWhoCan("reviewRequests");
}

/** "Couldn't find Ice Age (2002) — requested by Susan" to every reviewer,
 * the requester among them if they are one; "We're still looking for Ice
 * Age (2002)" to a requester who isn't (bell only unless they chose more). */
async function notifyNotFound(row: Candidate, seasons: number[] | null, year: number | null, reminder: boolean) {
  // In each reader's language (and the household's, for its channels).
  const shown = (t: Translator) => {
    const name = notFoundName(row.title, year, seasons, seasonsLabel(t, seasons));
    return row.is4k ? t("notify.requestIn4k", { request: name }) : name;
  };
  const who = row.requesterName || row.requesterUsername;
  const common = {
    mediaType: row.mediaType,
    tmdbId: row.tmdbId,
    title: row.title,
    eventType: "request_not_found" as const,
    requestId: row.id,
    is4k: row.is4k,
  };
  for (const [index, reviewer] of (await reviewers()).entries()) {
    const mine = reviewer.id === row.requesterId;
    await createNotification({
      ...common,
      userId: reviewer.id,
      message: (t) =>
        t(reminder ? "notify.stillCantFind" : "notify.cantFind", {
          title: shown(t),
          who: mine ? t("notify.requestedByYou") : who,
        }),
      relay: index === 0,
    }).catch(() => undefined);
  }
  if (!can({ role: row.requesterRole, permissions: row.requesterPermissions }, "reviewRequests")) {
    await createNotification({
      ...common,
      userId: row.requesterId,
      message: (t) => t("notify.stillLooking", { title: shown(t) }),
      topic: "request_still_looking",
      relay: false,
    }).catch(() => undefined);
  }
}

/** Once it's found or dismissed, its alerts have done their job. */
export async function clearNotFoundAlerts(requestId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ read: true })
    .where(
      and(
        eq(notifications.requestId, requestId),
        eq(notifications.eventType, "request_not_found"),
        eq(notifications.read, false),
      ),
    );
}

/** A Grab from Sonarr/Radarr's webhook: something was found, so every
 * flagged request for the title (and 4K-ness) stops being "Can't find"
 * without waiting for the next check. */
export async function clearNotFoundForTitle(mediaType: MediaType, tmdbId: number, fourK: boolean): Promise<void> {
  const cleared = await db
    .update(requests)
    .set({ notFoundSince: null })
    .where(
      and(
        eq(requests.mediaType, mediaType),
        eq(requests.tmdbId, tmdbId),
        eq(requests.is4k, fourK),
        eq(requests.status, "approved"),
        isNotNull(requests.notFoundSince),
      ),
    )
    .returning({ id: requests.id });
  for (const { id } of cleared) await clearNotFoundAlerts(id);
}

// ── The Requests page ────────────────────────────────────────────────────

const LIST_COLUMNS = {
  id: requests.id,
  mediaType: requests.mediaType,
  tmdbId: requests.tmdbId,
  title: requests.title,
  posterPath: requests.posterPath,
  seasons: requests.seasons,
  is4k: requests.is4k,
  createdAt: requests.createdAt,
  reviewedAt: requests.reviewedAt,
  notFoundSince: requests.notFoundSince,
  notFoundArrPath: requests.notFoundArrPath,
  arrServerId: requests.arrServerId,
  arrServerName: requests.arrServerName,
  requestedByUserId: requests.requestedByUserId,
  requestedByName: users.displayName,
  requestedByUsername: users.username,
};

const flagged = and(
  eq(requests.status, "approved"),
  isNull(requests.addFailedAt),
  isNotNull(requests.notFoundSince),
  isNull(requests.notFoundDismissedAt),
);

export type NotFoundRow = {
  id: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  seasons: number[] | null;
  is4k: boolean;
  createdAt: Date;
  reviewedAt: Date | null;
  notFoundSince: Date;
  requestedByUserId: string;
  requestedByName: string | null;
  requestedByUsername: string;
  server: { id: string | null; name: string | null; kind: "sonarr" | "radarr" };
  /** The title's page in Sonarr/Radarr, when the server is known. */
  arrUrl: string | null;
};

/** "Can't find", longest-missing first. For reviewers. */
export async function getNotFoundRequests(): Promise<NotFoundRow[]> {
  const rows = await db
    .select(LIST_COLUMNS)
    .from(requests)
    .innerJoin(users, eq(users.id, requests.requestedByUserId))
    .where(flagged)
    .orderBy(requests.notFoundSince, desc(requests.createdAt));
  if (rows.length === 0) return [];
  const owner = await getAdminUserId();
  const servers = new Map<string, ArrServer | null>();
  return Promise.all(
    rows.map(async (row) => {
      const key = row.arrServerId ?? `default:${row.mediaType}:${row.is4k}`;
      if (!servers.has(key)) servers.set(key, await serverFor(row, owner));
      const server = servers.get(key) ?? null;
      const kind = row.mediaType === "movie" ? ("radarr" as const) : ("sonarr" as const);
      return {
        id: row.id,
        mediaType: row.mediaType,
        tmdbId: row.tmdbId,
        title: row.title,
        posterPath: row.posterPath,
        seasons: row.seasons,
        is4k: row.is4k,
        createdAt: row.createdAt,
        reviewedAt: row.reviewedAt,
        notFoundSince: row.notFoundSince!,
        requestedByUserId: row.requestedByUserId,
        requestedByName: row.requestedByName,
        requestedByUsername: row.requestedByUsername,
        server: { id: server?.id ?? row.arrServerId, name: server?.name ?? row.arrServerName, kind },
        arrUrl: arrTitleUrl(server ? arrLinkBase(server) : null, row.notFoundArrPath),
      };
    }),
  );
}

export async function getNotFoundCount(): Promise<number> {
  const [row] = await db.select({ count: count() }).from(requests).where(flagged);
  return row?.count ?? 0;
}

/** When the title's approved request (regular or 4K) became "Can't find",
 * for the reviewer's title page; the earliest if several are. */
export async function getTitleNotFoundSince(mediaType: MediaType, tmdbId: number): Promise<Date | null> {
  const [row] = await db
    .select({ since: requests.notFoundSince })
    .from(requests)
    .where(and(flagged, eq(requests.mediaType, mediaType), eq(requests.tmdbId, tmdbId)))
    .orderBy(requests.notFoundSince)
    .limit(1);
  return row?.since ?? null;
}

async function flaggedRequest(requestId: string) {
  const [row] = await db
    .select({
      id: requests.id,
      mediaType: requests.mediaType,
      tmdbId: requests.tmdbId,
      tvdbId: titles.tvdbId,
      seasons: requests.seasons,
      is4k: requests.is4k,
      arrServerId: requests.arrServerId,
    })
    .from(requests)
    .leftJoin(titles, and(eq(titles.mediaType, requests.mediaType), eq(titles.tmdbId, requests.tmdbId)))
    .where(and(eq(requests.id, requestId), flagged))
    .limit(1);
  return row ?? null;
}

const NOT_LISTED = "notify.notInCantFind";

/** "Mark as found": off the list for good, its alerts read. The request
 * itself stays approved. */
export async function dismissNotFound(requestId: string): Promise<CoreResult> {
  const updated = await db
    .update(requests)
    .set({ notFoundSince: null, notFoundDismissedAt: new Date() })
    .where(and(eq(requests.id, requestId), flagged))
    .returning({ id: requests.id });
  if (updated.length === 0) return fail("not_found", (await getT())(NOT_LISTED));
  await clearNotFoundAlerts(requestId);
  return { ok: true };
}

/** "Search again": asks the request's Sonarr/Radarr to search for it now —
 * the requested seasons of a show, or the whole of it. It stays listed
 * until something is grabbed. */
export async function searchNotFoundAgain(requestId: string): Promise<CoreResult> {
  const t = await getT();
  const row = await flaggedRequest(requestId);
  if (!row) return fail("not_found", t(NOT_LISTED));
  const server = await serverFor(row, await getAdminUserId());
  const kind = row.mediaType === "movie" ? "Radarr" : "Sonarr";
  if (!server) return fail("conflict", t("notify.arrNotConnected", { kind }));
  const config = arrConfig(server);
  try {
    if (row.mediaType === "movie") {
      const movie = await radarr.getMovieByTmdbId(config, row.tmdbId);
      if (!movie) return fail("conflict", t("notify.arrDoesntHaveIt", { server: server.name }));
      await radarr.searchMovie(config, movie.id);
    } else {
      const tvdbId = row.tvdbId ?? (await getOrFetchTitle("tv", row.tmdbId).catch(() => null))?.tvdbId ?? null;
      const series = tvdbId ? await sonarr.getSeriesByTvdbId(config, tvdbId) : null;
      if (!series) return fail("conflict", t("notify.arrDoesntHaveIt", { server: server.name }));
      if (row.seasons && row.seasons.length > 0) {
        for (const season of row.seasons) await sonarr.searchSeason(config, series.id, season);
      } else {
        await sonarr.searchSeries(config, series.id);
      }
    }
  } catch {
    return fail("upstream", t("notify.arrUnreachable", { server: server.name }));
  }
  return { ok: true };
}
