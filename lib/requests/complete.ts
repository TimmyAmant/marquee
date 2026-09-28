import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { getAdminUserId } from "@/lib/auth/get-admin";
import { requests, titles } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import { mapWithLimit } from "@/lib/async/map-limit";
import { debounce } from "@/lib/async/single-flight";
import { askEachServer } from "@/lib/arr/fan-out";
import { arrConfig, listArrServers, listLibraryServers, type ArrServer } from "@/lib/arr/servers";
import * as radarr from "@/lib/radarr/client";
import * as sonarr from "@/lib/sonarr/client";
import { getPlexFileInfo } from "@/lib/plex/sync";
import { getJellyfinFileInfo } from "@/lib/jellyfin/sync";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { createNotification } from "@/lib/notifications/query";
import { activityRequestTitle } from "@/lib/requests/labels";
import type { Translator } from "@/lib/i18n/translator";
import {
  completionAction,
  completionVerdict,
  type EpisodeFacts,
  type TitleObservation,
} from "@/lib/requests/complete-rules";

// "Ready to watch": once everything a request asked for is in the library —
// the movie's file, or every aired episode of the seasons asked for (the
// rules are in lib/requests/complete-rules.ts) — whoever requested it is
// told, once per request (requests.notifiedCompleteAt). Checked after each
// Download webhook (debounced per title: a season pack is dozens of them)
// and after the hourly library syncs, so a missed or unconfigured webhook
// only delays it. The household channels post it once, with the first
// requester's copy; the admin hears about it only as a requester.

/** Each observation is a live call to the admin's Sonarr/Radarr. */
const CHECK_CONCURRENCY = 4;

/** In the background, so a big show's episode list can take its time. */
const LOOKUP_BUDGET_MS = 30_000;

/** A season pack imports one episode at a time over several minutes: wait
 * for this long a quiet spell before judging the title. */
const WEBHOOK_CHECK_DEBOUNCE_MS = 30_000;

export type CompletionScope = { mediaType: MediaType; tmdbId: number; is4k: boolean };

type Candidate = {
  id: string;
  requesterId: string;
  mediaType: MediaType;
  tmdbId: number;
  tvdbId: number | null;
  title: string;
  seasons: number[] | null;
  is4k: boolean;
  armed: boolean;
};

/** After a Download webhook: checks the title once things go quiet. */
export function scheduleCompletionCheck(scope: CompletionScope): void {
  debounce(`complete-check:${scope.mediaType}:${scope.tmdbId}:${scope.is4k}`, WEBHOOK_CHECK_DEBOUNCE_MS, () => {
    checkCompletedRequests(scope).catch((err) => {
      console.error("[complete-check] webhook check failed:", err);
    });
  });
}

/**
 * Every open (pending or approved) request not yet announced — or just one
 * title's — judged against what the library has now, and announced if it's
 * complete. Safe to run from several places at once: a request is claimed
 * by a conditional update before anyone is told.
 */
export async function checkCompletedRequests(scope?: CompletionScope, now = new Date()): Promise<void> {
  const rows: Candidate[] = await db
    .select({
      id: requests.id,
      requesterId: requests.requestedByUserId,
      mediaType: requests.mediaType,
      tmdbId: requests.tmdbId,
      tvdbId: titles.tvdbId,
      title: requests.title,
      seasons: requests.seasons,
      is4k: requests.is4k,
      armed: requests.completeNoticeArmed,
    })
    .from(requests)
    .leftJoin(titles, and(eq(titles.mediaType, requests.mediaType), eq(titles.tmdbId, requests.tmdbId)))
    .where(
      and(
        inArray(requests.status, ["pending", "approved"]),
        isNull(requests.notifiedCompleteAt),
        // Taken off Sonarr/Radarr on purpose (lib/arr/remove.ts).
        isNull(requests.removedAt),
        ...(scope
          ? [eq(requests.mediaType, scope.mediaType), eq(requests.tmdbId, scope.tmdbId), eq(requests.is4k, scope.is4k)]
          : []),
      ),
    )
    .orderBy(requests.createdAt);
  if (rows.length === 0) return;

  const groups = new Map<string, Candidate[]>();
  for (const row of rows) {
    const key = `${row.mediaType}:${row.tmdbId}:${row.is4k}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const owner = await getAdminUserId();
  await mapWithLimit([...groups.values()], CHECK_CONCURRENCY, async (group) => {
    const [first] = group;
    const observation = await observeTitle(owner, first).catch((): TitleObservation => ({ kind: "unknown" }));
    await settle(group, observation, now).catch((err) => {
      console.error("[complete-check] settling failed:", err);
    });
  });
}

/** Acts on one title's requests given what the library has of it. */
async function settle(group: Candidate[], observation: TitleObservation, now: Date): Promise<void> {
  const toArm: string[] = [];
  const toClaim: string[] = [];
  for (const row of group) {
    const action = completionAction(completionVerdict(observation, row.seasons, now), row.armed);
    if (action === "arm") toArm.push(row.id);
    if (action === "announce" || action === "mark") toClaim.push(row.id);
  }

  if (toArm.length > 0) {
    await db
      .update(requests)
      .set({ completeNoticeArmed: true })
      .where(and(inArray(requests.id, toArm), isNull(requests.notifiedCompleteAt)));
  }
  if (toClaim.length === 0) return;

  // The claim: only the check whose update sets it may announce it. The
  // episodes of a season pack arrive as parallel webhooks, and the hourly
  // check can land at the same moment.
  const claimed = await db
    .update(requests)
    .set({ notifiedCompleteAt: now })
    .where(and(inArray(requests.id, toClaim), isNull(requests.notifiedCompleteAt)))
    .returning({ id: requests.id, armed: requests.completeNoticeArmed });
  const announce = new Set(claimed.filter((c) => c.armed).map((c) => c.id));
  if (announce.size === 0) return;

  // One notice per person, however many of their requests for the title
  // just completed (a season request approved, another still pending).
  const byRequester = new Map<string, Candidate[]>();
  for (const row of group) {
    if (!announce.has(row.id)) continue;
    byRequester.set(row.requesterId, [...(byRequester.get(row.requesterId) ?? []), row]);
  }

  let relay = true;
  for (const mine of byRequester.values()) {
    await announceComplete(mine, relay).catch((err) => {
      console.error("[complete-check] notifying failed:", err);
    });
    // The household channels hear it once, with the first requester's.
    relay = false;
  }
}

/** Every season among the requests, or null if any is the whole show. */
function seasonsOf(rows: Candidate[]): number[] | null {
  if (rows.some((r) => r.seasons === null)) return null;
  return [...new Set(rows.flatMap((r) => r.seasons ?? []))].sort((a, b) => a - b);
}

async function announceComplete(rows: Candidate[], relay: boolean): Promise<void> {
  const [row] = rows;
  const seasons = row.mediaType === "tv" ? seasonsOf(rows) : null;
  const in4k = (t: Translator, name: string) => (row.is4k ? t("notify.requestIn4k", { request: name }) : name);
  const movie = row.mediaType === "movie";
  await createNotification({
    userId: row.requesterId,
    mediaType: row.mediaType,
    tmdbId: row.tmdbId,
    title: row.title,
    eventType: "downloaded",
    message: (t) =>
      t(movie ? "notify.requestedMovieReady" : "notify.requestedShowReady", {
        title: in4k(t, activityRequestTitle(t, row.title, seasons)),
      }),
    householdMessage: (t) =>
      t(movie ? "notify.titleReady" : "notify.showReady", {
        title: in4k(t, activityRequestTitle(t, row.title, seasons)),
      }),
    relay,
    is4k: row.is4k,
  });
}

// ── What the library has ─────────────────────────────────────────────────

type ServerAnswer<T> = { answered: true; value: T } | { answered: false };
const NO_ANSWER: ServerAnswer<never> = { answered: false };

function serversFor(owner: string, kind: "radarr" | "sonarr", fourK: boolean): Promise<ArrServer[]> {
  // The 4K copy is only ever on a 4K server, and the regular one on the
  // library's (standard) servers.
  return fourK ? listArrServers(owner, { kind, fourK: true }) : listLibraryServers(owner, kind);
}

async function observeTitle(owner: string | null, row: Candidate): Promise<TitleObservation> {
  if (!owner) return { kind: "unknown" };
  return row.mediaType === "movie" ? observeMovie(owner, row) : observeShow(owner, row);
}

async function observeMovie(owner: string, row: Candidate): Promise<TitleObservation> {
  // In Plex or Jellyfin counts, whatever Radarr says — for the regular copy:
  // a 4K request wants the 4K server's file.
  if (!row.is4k) {
    const [plex, jellyfin] = await Promise.all([
      getPlexFileInfo(owner, "movie", row.tmdbId, null).catch(() => null),
      getJellyfinFileInfo(owner, "movie", row.tmdbId, null).catch(() => null),
    ]);
    if (plex || jellyfin) return { kind: "movie", hasFile: true };
  }
  const servers = await serversFor(owner, "radarr", row.is4k);
  // No Radarr: the media servers above are all there is to go on.
  if (servers.length === 0) return row.is4k ? { kind: "unknown" } : { kind: "movie", hasFile: false };
  const answers = await askEachServer(
    servers,
    async (server): Promise<ServerAnswer<boolean>> => {
      const movie = await radarr.getMovieByTmdbId(arrConfig(server), row.tmdbId);
      return { answered: true, value: movie?.hasFile === true };
    },
    NO_ANSWER,
    LOOKUP_BUDGET_MS,
  );
  const answered = answers.flatMap(({ value }) => (value.answered ? [value.value] : []));
  if (answered.length === 0) return { kind: "unknown" };
  return { kind: "movie", hasFile: answered.some(Boolean) };
}

async function observeShow(owner: string, row: Candidate): Promise<TitleObservation> {
  // Plex and Jellyfin only know how many episodes there are, not which ones
  // or when they aired, so a show is judged by Sonarr alone.
  const tvdbId = row.tvdbId ?? (await getOrFetchTitle("tv", row.tmdbId).catch(() => null))?.tvdbId ?? null;
  if (!tvdbId) return { kind: "unknown" };
  const servers = await serversFor(owner, "sonarr", row.is4k);
  if (servers.length === 0) return { kind: "unknown" };
  const answers = await askEachServer(
    servers,
    async (server): Promise<ServerAnswer<EpisodeFacts[] | null>> => {
      const config = arrConfig(server);
      const series = await sonarr.getSeriesByTvdbId(config, tvdbId);
      if (!series) return { answered: true, value: null };
      return { answered: true, value: await sonarr.getAllEpisodes(config, series.id) };
    },
    NO_ANSWER,
    LOOKUP_BUDGET_MS,
  );
  const answered = answers.flatMap(({ value }) => (value.answered ? [value.value] : []));
  if (answered.length === 0) return { kind: "unknown" };
  return { kind: "tv", copies: answered.filter((e): e is EpisodeFacts[] => e !== null) };
}

