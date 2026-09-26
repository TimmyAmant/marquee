import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { plexWatchlistItems, plexWatchlists, users } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto/encryption";
import { singleFlight } from "@/lib/async/single-flight";
import { createRequest } from "@/lib/requests/mutate";
import { getLibraryOwnerUserId } from "@/lib/integrations/library-owner";
import { fetchWatchlist, type WatchlistItem } from "@/lib/plex/watchlist-api";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { getQuota } from "@/lib/requests/quota";

// "Request what's on my Plex Watchlist": a member turns it on with their own
// Plex account (lib/auth/media-signin.ts startPlexWatchlist/pollPlexWatchlist
// hands the token over), and every sync files a normal request — the same
// checks, auto-approve and admin queue as the Request button — for each new
// movie or show on it.

/** New titles requested per member per sync. The rest wait for the next
 * sync, so a long watchlist turned on for the first time trickles into the
 * admin's queue instead of arriving all at once. */
export const MAX_NEW_REQUESTS_PER_SYNC = 25;

/** "Check now": at most this many per member per window. */
export const SYNC_NOW_LIMIT = 5;
export const SYNC_NOW_WINDOW_MS = 5 * 60 * 1000;

export const WATCHLIST_TOKEN_REJECTED =
  "Plex stopped accepting Marquee's access to your watchlist (for example after signing out of all devices). Turn it on again to reconnect.";
const WATCHLIST_LIMITED =
  "You've reached your request limit, so the rest of your watchlist waits until you have requests left.";
const WATCHLIST_UNREACHABLE = "Couldn't reach Plex to read your watchlist. Marquee will try again shortly.";

export type WatchlistState = {
  /** Whether turning it on is possible: the account has Plex linked. */
  available: boolean;
  enabled: boolean;
  movies: boolean;
  tv: boolean;
  lastSyncedAt: Date | null;
  lastError: string | null;
  /** Titles requested from the watchlist so far. */
  requestedCount: number;
};

async function getRow(userId: string) {
  const [row] = await db.select().from(plexWatchlists).where(eq(plexWatchlists.userId, userId)).limit(1);
  return row ?? null;
}

/** The stored token; "unreadable" when it can't be decrypted (the
 * server's encryption key changed), which is handled like Plex rejecting it. */
function tokenOf(row: typeof plexWatchlists.$inferSelect): string | null | "unreadable" {
  if (!row.authTokenEnc || !row.authTokenIv || !row.authTokenTag) return null;
  try {
    return decryptSecret({ ciphertext: row.authTokenEnc, iv: row.authTokenIv, tag: row.authTokenTag });
  } catch {
    return "unreadable";
  }
}

async function switchOffRejected(userId: string): Promise<void> {
  await db
    .update(plexWatchlists)
    .set({ authTokenEnc: null, authTokenIv: null, authTokenTag: null, etag: null, lastError: WATCHLIST_TOKEN_REJECTED })
    .where(eq(plexWatchlists.userId, userId));
}

export async function getWatchlistState(userId: string): Promise<WatchlistState> {
  const [[user], row, requested] = await Promise.all([
    db.select({ plexUserId: users.plexUserId }).from(users).where(eq(users.id, userId)).limit(1),
    getRow(userId),
    db
      .select({ tmdbId: plexWatchlistItems.tmdbId })
      .from(plexWatchlistItems)
      .where(and(eq(plexWatchlistItems.userId, userId), eq(plexWatchlistItems.outcome, "requested"))),
  ]);
  const linked = Boolean(user?.plexUserId);
  // A row left from a Plex account that's since been unlinked or swapped
  // doesn't count (unlinking deletes it; this covers anything in between).
  const current = row && linked && row.plexUserId === user?.plexUserId ? row : null;
  return {
    available: linked,
    enabled: Boolean(current?.authTokenEnc),
    movies: current?.syncMovies ?? true,
    tv: current?.syncTv ?? true,
    lastSyncedAt: current?.lastSyncedAt ?? null,
    lastError: current?.lastError ?? null,
    requestedCount: requested.length,
  };
}

/** Saves the member's Plex token for their watchlist (turning it on, or
 * reconnecting after Plex rejected the old one). Keeps their movie/TV
 * choices; starts from a fresh read of the list. */
export async function enableWatchlist(
  userId: string,
  grant: { plexUserId: string; authToken: string; clientId: string },
): Promise<void> {
  const token = encryptSecret(grant.authToken);
  const values = {
    plexUserId: grant.plexUserId,
    authTokenEnc: token.ciphertext,
    authTokenIv: token.iv,
    authTokenTag: token.tag,
    clientId: grant.clientId,
    etag: null,
    lastError: null,
  };
  await db
    .insert(plexWatchlists)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: plexWatchlists.userId, set: values });
}

/** Turns it off and forgets the token. The list of titles already handled
 * stays, so turning it on again doesn't re-request ones the admin declined. */
export async function disableWatchlist(userId: string): Promise<void> {
  await db.delete(plexWatchlists).where(eq(plexWatchlists.userId, userId));
}

export async function setWatchlistTypes(userId: string, types: { movies?: boolean; tv?: boolean }): Promise<void> {
  const set: Partial<typeof plexWatchlists.$inferInsert> = {};
  if (types.movies !== undefined) set.syncMovies = types.movies;
  if (types.tv !== undefined) set.syncTv = types.tv;
  if (Object.keys(set).length === 0) return;
  // Titles of a type that was off were never recorded, and an unchanged
  // list answers 304 — so read it afresh to pick them up.
  await db
    .update(plexWatchlists)
    .set({ ...set, etag: null })
    .where(eq(plexWatchlists.userId, userId));
}

type SyncOutcome = { requested: number };

/** The titles on this watchlist worth trying now: of a type that's on, and
 * not handled before. Pure; unit tested. */
export function pendingWatchlistItems(
  items: WatchlistItem[],
  types: { movies: boolean; tv: boolean },
  handled: ReadonlySet<string>,
): WatchlistItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.mediaType}:${item.tmdbId}`;
    if (seen.has(key) || handled.has(key)) return false;
    seen.add(key);
    return item.mediaType === "movie" ? types.movies : types.tv;
  });
}

async function runWatchlistSync(userId: string): Promise<SyncOutcome> {
  const row = await getRow(userId);
  if (!row) return { requested: 0 };
  const token = tokenOf(row);
  if (!token) return { requested: 0 };
  if (token === "unreadable") {
    await switchOffRejected(userId);
    return { requested: 0 };
  }

  const [user] = await db
    .select({ plexUserId: users.plexUserId, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || user.plexUserId !== row.plexUserId) {
    // Plex was unlinked or swapped for another account: this token is no
    // longer theirs to use here.
    await disableWatchlist(userId);
    return { requested: 0 };
  }

  let fetched;
  try {
    fetched = await fetchWatchlist(row.clientId, token, row.etag);
  } catch {
    await db.update(plexWatchlists).set({ lastError: WATCHLIST_UNREACHABLE }).where(eq(plexWatchlists.userId, userId));
    return { requested: 0 };
  }

  if (fetched.status === "unauthorized") {
    await switchOffRejected(userId);
    return { requested: 0 };
  }
  if (fetched.status === "unchanged") {
    await db
      .update(plexWatchlists)
      .set({ lastSyncedAt: new Date(), lastError: null })
      .where(eq(plexWatchlists.userId, userId));
    return { requested: 0 };
  }

  const handledRows = await db
    .select({ mediaType: plexWatchlistItems.mediaType, tmdbId: plexWatchlistItems.tmdbId })
    .from(plexWatchlistItems)
    .where(eq(plexWatchlistItems.userId, userId));
  const handled = new Set(handledRows.map((r) => `${r.mediaType}:${r.tmdbId}`));
  const pending = pendingWatchlistItems(fetched.items, { movies: row.syncMovies, tv: row.syncTv }, handled);

  const viewer = { userId, isAdmin: user.role === "admin", libraryOwnerId: await getLibraryOwnerUserId(userId) };
  let requested = 0;
  // Only a list handled in full keeps its ETag: otherwise the next read
  // would answer 304 and the titles left over would never be tried.
  let complete = pending.length <= MAX_NEW_REQUESTS_PER_SYNC;

  // The member's request limits (lib/requests/quota.ts): titles of a type
  // that's used up wait — without being looked up or tried — until a slot
  // frees, and the card says why.
  const [movieQuota, tvQuota] = await Promise.all([getQuota(userId, "movie"), getQuota(userId, "tv")]);
  const left = { movie: movieQuota?.remaining ?? Infinity, tv: tvQuota?.remaining ?? Infinity };
  let limited = false;

  for (const item of pending.slice(0, MAX_NEW_REQUESTS_PER_SYNC)) {
    if (left[item.mediaType] <= 0) {
      limited = true;
      complete = false;
      continue;
    }
    // createRequest carries on without TMDb (for the Request button, the
    // browser supplied the name), but then it can't tell a show the library
    // already has by its TVDB id. Nobody's waiting on a watchlist title, so
    // it waits for TMDb instead.
    const known = await getOrFetchTitle(item.mediaType, item.tmdbId).catch(() => null);
    if (!known) {
      complete = false;
      continue;
    }
    const result = await createRequest(viewer, {
      mediaType: item.mediaType,
      tmdbId: item.tmdbId,
      title: item.title,
      posterPath: null,
    }).catch(() => null);

    let outcome: "requested" | "skipped" | null;
    if (result?.ok) outcome = "requested";
    // Already owned, or already asked for by this member (a request that's
    // pending, approved, or — for a show — covers some seasons): the member
    // is handling this title themselves, so it's left to them.
    // Blocked by the admin (lib/requests/blocklist.ts): not asked for again.
    else if (result && (result.code === "conflict" || result.code === "invalid" || result.code === "forbidden"))
      outcome = "skipped";
    // TMDb or the database hiccuped: try again next sync.
    else outcome = null;

    if (!outcome) {
      complete = false;
      continue;
    }
    if (outcome === "requested") {
      requested++;
      left[item.mediaType]--;
    }
    await db
      .insert(plexWatchlistItems)
      .values({
        userId,
        mediaType: item.mediaType as MediaType,
        tmdbId: item.tmdbId,
        outcome,
        requestId: result?.ok ? result.requestId : null,
      })
      .onConflictDoNothing()
      // The request itself stands; next time the title just counts as
      // already requested.
      .catch((err) => console.error("[plex-watchlist] couldn't record a handled title:", err));
  }

  await db
    .update(plexWatchlists)
    .set({ etag: complete ? fetched.etag : null, lastSyncedAt: new Date(), lastError: limited ? WATCHLIST_LIMITED : null })
    .where(eq(plexWatchlists.userId, userId));
  return { requested };
}

/** One member's watchlist sync; overlapping calls share one run. */
export function syncPlexWatchlist(userId: string): Promise<SyncOutcome> {
  return singleFlight(`plex-watchlist:${userId}`, () => runWatchlistSync(userId));
}

/** The scheduled job: every member with the watchlist on, one at a time. */
export async function syncAllPlexWatchlists(): Promise<void> {
  const rows = await db
    .select({ userId: plexWatchlists.userId })
    .from(plexWatchlists)
    .where(isNotNull(plexWatchlists.authTokenEnc));
  for (const { userId } of rows) {
    await syncPlexWatchlist(userId).catch((err) => {
      console.error(`[plex-watchlist] sync failed for ${userId}:`, err);
    });
  }
}
