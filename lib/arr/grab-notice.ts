import type { ArrProvider, MediaType } from "@/lib/db/schema";
import { arrConfig, getDefaultArrServer, type ArrServer } from "@/lib/arr/servers";
import { createNotification } from "@/lib/notifications/query";
import type { Translator } from "@/lib/i18n/translator";
import * as radarr from "@/lib/radarr/client";
import * as sonarr from "@/lib/sonarr/client";

// "Started downloading", said only once it's true. Sonarr/Radarr send a Grab
// the moment the download client accepts a release, and plenty of grabs
// never become a download: a fake release of an episode that hasn't aired
// (they turn up on public trackers a day early, and Sonarr grabs them,
// since nothing rejects an unaired episode by default) is failed, deleted
// from the client and blocklisted once Sonarr sees what's in it, leaving
// nothing in the queue or the client and only a line in Sonarr's History.
// Announcing every Grab straight away told the admin something was
// downloading when, by the time they looked, nothing was.
//
// So a grab is held for a little while, then looked up on the server it
// came from: still in the queue, or already imported, and it's announced
// (naming the episodes); failed, ignored or gone, and it's dropped with a
// line in the log. A server that can't be asked gets the benefit of the
// doubt: the notice is the feature, and a missed real download is worse
// than an unconfirmed one. Holds live in memory, so a restart during one
// loses that notice; it's a couple of minutes' window, and the download
// itself carries on regardless.

/** How long a grab waits before it's checked: Sonarr/Radarr refresh their
 * queue every minute, and a release the client chokes on is failed by then. */
export const GRAB_HOLD_MS = 2 * 60 * 1000;
/** A grab of episodes that haven't aired waits longer: those are the likely
 * fakes, and Sonarr only finds out once the download has finished. */
export const EARLY_GRAB_HOLD_MS = 20 * 60 * 1000;
/** An episode airing within this long counts as out already: Sonarr's air
 * times are the network's, and streaming drops land a little ahead. */
const AIR_GRACE_MS = 2 * 60 * 60 * 1000;
/** A repeat notice about the same title within this window is the same news
 * (a season grabbed one episode at a time). */
const NOTIFICATION_DEDUPE_WINDOW_MS = 30 * 60 * 1000;
/** At most this many episode codes are spelled out in a notice. */
const LISTED_EPISODES = 3;

/** One episode of a Sonarr Grab payload. */
export type GrabEpisode = { seasonNumber?: number; episodeNumber?: number; airDateUtc?: string };

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The episodes a grab is for, the way Sonarr writes them: "S02E05",
 * "S02E05-E07" for a run within a season, "S02E05, S03E01" for a few, or
 * "S02E05 +7" for many. Null when there are none to name (a movie). Pure.
 */
export function episodesLabel(episodes: readonly GrabEpisode[]): string | null {
  const known = episodes.flatMap((e) =>
    Number.isInteger(e.seasonNumber) && Number.isInteger(e.episodeNumber)
      ? [{ season: e.seasonNumber as number, episode: e.episodeNumber as number }]
      : [],
  );
  const unique = [...new Map(known.map((e) => [`${e.season}:${e.episode}`, e])).values()].sort(
    (a, b) => a.season - b.season || a.episode - b.episode,
  );
  if (unique.length === 0) return null;
  const code = (e: { season: number; episode: number }) => `S${pad(e.season)}E${pad(e.episode)}`;
  const first = unique[0];
  const last = unique[unique.length - 1];
  const oneRun =
    unique.length > 1 &&
    unique.every((e, i) => e.season === first.season && e.episode === first.episode + i);
  if (oneRun) return `${code(first)}-E${pad(last.episode)}`;
  if (unique.length <= LISTED_EPISODES) return unique.map(code).join(", ");
  return `${code(first)} +${unique.length - 1}`;
}

/** When the grab's episodes air, if none of them has yet: the earliest air
 * time, when every episode airs more than AIR_GRACE_MS from `now`. Null if
 * any has aired, or any air time is unknown. Pure. */
export function airsLater(episodes: readonly GrabEpisode[], now: number): Date | null {
  if (episodes.length === 0) return null;
  let earliest = Infinity;
  for (const episode of episodes) {
    const airs = episode.airDateUtc ? Date.parse(episode.airDateUtc) : NaN;
    if (!Number.isFinite(airs) || airs <= now + AIR_GRACE_MS) return null;
    earliest = Math.min(earliest, airs);
  }
  return new Date(earliest);
}

/** What the server said about one held download. */
export type GrabCheck = { reachable: false } | { reachable: true; inQueue: boolean; history: readonly string[] };

/** Announce a held download, or drop it. Failed or ignored loses even if a
 * stale queue record is still around; imported counts as having downloaded
 * (it just finished quickly); in neither the queue nor the history, it was
 * removed without arriving. Pure. */
export function grabVerdict(check: GrabCheck): "announce" | "drop" {
  if (!check.reachable) return "announce";
  if (check.history.some((event) => event === "downloadFailed" || event === "downloadIgnored")) return "drop";
  if (check.inQueue) return "announce";
  if (check.history.includes("downloadFolderImported")) return "announce";
  return "drop";
}

/** A Grab waiting to be checked: one per title and server, gathering the
 * episodes of any further grabs of that title while it waits. */
export type HeldGrab = {
  ownerId: string;
  kind: ArrProvider;
  fourK: boolean;
  /** The server the webhook came from; null for the older per-account URLs,
   * which mean the default server of the kind. */
  server: ArrServer | null;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  /** Episodes per download id, keyed as the server wrote the id (its
   * history filter matches it exactly); "" for a grab without one. */
  downloads: Map<string, GrabEpisode[]>;
};

/** A held grab and when it's due to be checked. */
type Hold = { grab: HeldGrab; checkAt: number; timer: ReturnType<typeof setTimeout> };

declare global {
  var __marqueeHeldGrabs: Map<string, Hold> | undefined;
}

// On globalThis like the other webhook state (lib/async/single-flight.ts):
// Next.js can load this module more than once per process.
const held: Map<string, Hold> = (globalThis.__marqueeHeldGrabs ??= new Map());

export type GrabInput = Omit<HeldGrab, "downloads"> & {
  episodes: GrabEpisode[];
  downloadId: string | null;
};

/** After a Grab webhook: announce it once it's been confirmed. */
export function holdGrabNotice(input: GrabInput, now = Date.now()): void {
  const key = [input.ownerId, input.server?.id ?? input.kind, input.mediaType, input.tmdbId, input.fourK].join(":");
  const downloadKey = input.downloadId ?? "";
  const checkAt = now + (airsLater(input.episodes, now) ? EARLY_GRAB_HOLD_MS : GRAB_HOLD_MS);
  const waiting = held.get(key);
  // Another grab of a title already waiting joins it, and pushes the check
  // back if it needs the longer wait (an unaired episode's).
  if (waiting) {
    const downloads = waiting.grab.downloads;
    downloads.set(downloadKey, [...(downloads.get(downloadKey) ?? []), ...input.episodes]);
    if (checkAt <= waiting.checkAt) return;
    clearTimeout(waiting.timer);
  }
  const grab: HeldGrab = waiting?.grab ?? {
    ownerId: input.ownerId,
    kind: input.kind,
    fourK: input.fourK,
    server: input.server,
    mediaType: input.mediaType,
    tmdbId: input.tmdbId,
    title: input.title,
    downloads: new Map([[downloadKey, input.episodes]]),
  };
  const timer = setTimeout(() => {
    held.delete(key);
    announceIfConfirmed(grab).catch((err) => {
      console.error(`[webhook] checking the grab of "${grab.title}" failed:`, err);
    });
  }, checkAt - now);
  timer.unref?.();
  held.set(key, { grab, checkAt, timer });
}

/** Looks each held download up on its server and announces the confirmed
 * ones. Exported for tests. */
export async function announceIfConfirmed(grab: HeldGrab, now = Date.now()): Promise<boolean> {
  // "Is it still there" only means something on the server that grabbed it.
  const server = grab.server ?? (await getDefaultArrServer(grab.ownerId, grab.kind, grab.fourK).catch(() => null));
  const confirmed: GrabEpisode[] = [];
  const dropped: string[] = [];
  let queue: Set<string> | null | undefined;
  for (const [downloadId, episodes] of grab.downloads) {
    // No id to look up (an old server, a blackhole client): as before.
    if (!downloadId || !server) {
      confirmed.push(...episodes);
      continue;
    }
    const config = arrConfig(server);
    const client = grab.kind === "radarr" ? radarr : sonarr;
    if (queue === undefined) queue = await client.getQueueDownloadIds(config).catch(() => null);
    const history = queue ? await client.getDownloadHistory(config, downloadId).catch(() => null) : null;
    const check: GrabCheck =
      queue && history
        ? { reachable: true, inQueue: queue.has(downloadId.toUpperCase()), history }
        : { reachable: false };
    if (grabVerdict(check) === "announce") {
      confirmed.push(...episodes);
    } else {
      dropped.push(downloadId);
    }
  }

  const label = episodesLabel(confirmed);
  if (dropped.length > 0) {
    const what = dropped.length === grab.downloads.size ? "not announcing it" : "announcing the rest";
    console.info(
      `[webhook] ${grab.kind} grab of "${grab.title}" failed or was removed before it downloaded (${dropped.join(", ")}): ${what}`,
    );
  }
  if (dropped.length === grab.downloads.size) return false;

  const early = airsLater(confirmed, now) !== null;
  const { title, fourK } = grab;
  // In the account's language, and the household's for its channels.
  const message = (t: Translator) => {
    const name = fourK ? t("notify.requestIn4k", { request: title }) : title;
    if (!label) return t("notify.startedDownloading", { title: name });
    return t(early ? "notify.startedDownloadingEarly" : "notify.startedDownloadingEpisodes", { title: name, episodes: label });
  };
  return createNotification({
    userId: grab.ownerId,
    mediaType: grab.mediaType,
    tmdbId: grab.tmdbId,
    title,
    eventType: "grabbed",
    message,
    dedupeSince: new Date(now - NOTIFICATION_DEDUPE_WINDOW_MS),
    is4k: fourK,
  });
}
