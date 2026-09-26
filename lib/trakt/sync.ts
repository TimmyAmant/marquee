import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { traktSyncItems, traktSyncs, users } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import { runExclusive, singleFlight } from "@/lib/async/single-flight";
import { createRequest } from "@/lib/requests/mutate";
import { getLibraryOwnerUserId } from "@/lib/integrations/library-owner";
import { getTraktClientId } from "@/lib/integrations/app-settings";
import { getTraktItems, type TraktListItem } from "@/lib/trakt/client";
import { parseTraktUrl, type ParsedTraktUrl } from "@/lib/trakt/url";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { getQuota } from "@/lib/requests/quota";
import { notifyReviewersOfTraktSync } from "@/lib/requests/alerts";
import { can, requestPermission, type PermissionSubject } from "@/lib/users/permissions";
import type { CoreResult } from "@/lib/core-result";
import { failT } from "@/lib/core-failure";
import { englishT } from "@/lib/i18n/catalog";
import { getT } from "@/lib/i18n/server";
import type { MessageKey, Translator } from "@/lib/i18n/translator";
import type { TraktSync } from "@/lib/api/types";

// "Keep in sync" with a public Trakt watchlist or list: each member adds
// their own (Settings → Account), and every few hours (the trakt-sync job)
// each new movie or show on it is filed as a normal request from that
// member — createRequest, so their permissions, request limits, the
// blocklist and auto-approve all apply, like pressing Request. Reviewers get
// one alert per list per check. Each title is tried once per member (the
// trakt_sync_items table), so a declined one isn't asked for again.

export const MAX_SYNCS_PER_MEMBER = 10;
/** New titles requested per list per check; the rest follow next time. */
export const MAX_NEW_REQUESTS_PER_SYNC = 25;
/** "Check now": at most this many per member per window. */
export const SYNC_NOW_LIMIT = 5;
export const SYNC_NOW_WINDOW_MS = 5 * 60 * 1000;

const NOT_CONNECTED = "server.traktNotConnected" satisfies MessageKey;
const UNREADABLE = "server.traktListUnreadable" satisfies MessageKey;
const UNREACHABLE = "server.traktListUnreachable" satisfies MessageKey;
const LIMITED = "server.traktListLimited" satisfies MessageKey;

/** What a check leaves in lastError: stored in English, as it always was,
 * and shown in the reader's language (lastErrorIn). */
const STORED_ERRORS: readonly MessageKey[] = [NOT_CONNECTED, UNREADABLE, UNREACHABLE, LIMITED];

function storedError(key: MessageKey): string {
  return englishT()(key);
}

function lastErrorIn(t: Translator, stored: string | null): string | null {
  if (!stored) return stored;
  const key = STORED_ERRORS.find((k) => storedError(k) === stored);
  return key ? t(key) : stored;
}

export type TraktSyncItem = { mediaType: MediaType; tmdbId: number; title: string };

type Actor = PermissionSubject & { id: string };

/** A Trakt list item as a title to request; null when it has no TMDb id. */
export function traktItemTitle(item: TraktListItem): TraktSyncItem | null {
  const entity = item.movie ?? item.show;
  const tmdbId = entity?.ids.tmdb;
  if (!entity || !tmdbId || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) return null;
  return { mediaType: item.type === "movie" ? "movie" : "tv", tmdbId, title: entity.title };
}

/** The titles on a list worth trying now: with a TMDb id, of a kind that's
 * on, not handled before, each once. Pure; unit tested. */
export function pendingTraktItems(
  items: TraktListItem[],
  types: { movies: boolean; tv: boolean },
  handled: ReadonlySet<string>,
): TraktSyncItem[] {
  const seen = new Set<string>();
  const out: TraktSyncItem[] = [];
  for (const item of items) {
    const title = traktItemTitle(item);
    if (!title) continue;
    const key = `${title.mediaType}:${title.tmdbId}`;
    if (seen.has(key) || handled.has(key)) continue;
    seen.add(key);
    if (title.mediaType === "movie" ? types.movies : types.tv) out.push(title);
  }
  return out;
}

/** "Best of 2024" from its link, or "someone's watchlist" (in `t`'s
 * language). */
export function traktListName(list: ParsedTraktUrl, t: Translator = englishT()): string {
  if (list.kind === "watchlist") return t("server.traktWatchlistName", { username: list.username });
  const words = list.slug.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : list.slug;
}

type Row = typeof traktSyncs.$inferSelect;

function parsedOf(row: Pick<Row, "kind" | "username" | "slug">): ParsedTraktUrl {
  return row.kind === "watchlist"
    ? { kind: "watchlist", username: row.username }
    : { kind: "list", username: row.username, slug: row.slug };
}

function urlOf(list: ParsedTraktUrl): string {
  const user = encodeURIComponent(list.username);
  return list.kind === "watchlist"
    ? `https://trakt.tv/users/${user}/watchlist`
    : `https://trakt.tv/users/${user}/lists/${encodeURIComponent(list.slug)}`;
}

async function readList(clientId: string, list: ParsedTraktUrl): Promise<TraktListItem[] | "missing" | "unreachable"> {
  try {
    return await getTraktItems({ clientId }, list);
  } catch (err) {
    // A private or deleted list answers 401/403/404; anything else is Trakt
    // being unreachable for now.
    return /\((401|403|404)\)$/.test(String((err as Error)?.message)) ? "missing" : "unreachable";
  }
}

// ── Reading ────────────────────────────────────────────────────────────────

/** Syncs as the API shows them: one member's, or everyone's (the admin). */
export async function listTraktSyncs(scope: { userId: string } | "all"): Promise<TraktSync[]> {
  const where = scope === "all" ? undefined : eq(traktSyncs.userId, scope.userId);
  const [t, rows, counts] = await Promise.all([
    getT(),
    db
      .select({ sync: traktSyncs, username: users.username, displayName: users.displayName })
      .from(traktSyncs)
      .innerJoin(users, eq(users.id, traktSyncs.userId))
      .where(where)
      .orderBy(asc(traktSyncs.createdAt)),
    db
      .select({ syncId: traktSyncItems.syncId, n: count() })
      .from(traktSyncItems)
      .where(
        and(
          eq(traktSyncItems.outcome, "requested"),
          scope === "all" ? undefined : eq(traktSyncItems.userId, scope.userId),
        ),
      )
      .groupBy(traktSyncItems.syncId),
  ]);
  const requested = new Map(counts.map((c) => [c.syncId, Number(c.n)]));
  return rows.map(({ sync, username, displayName }) => {
    const list = parsedOf(sync);
    return {
      id: sync.id,
      kind: sync.kind,
      url: urlOf(list),
      name: traktListName(list, t),
      movies: sync.syncMovies,
      tv: sync.syncTv,
      lastSyncedAt: sync.lastSyncedAt?.toISOString() ?? null,
      lastError: lastErrorIn(t, sync.lastError),
      requestedCount: requested.get(sync.id) ?? 0,
      createdAt: sync.createdAt.toISOString(),
      owner: { id: sync.userId, username, displayName },
    };
  });
}

export type TraktSyncsState = { syncs: TraktSync[]; available: boolean };

/** What Settings → Account shows `user`: their own syncs, or everyone's for
 * the admin, and whether Trakt is connected. Server-side only — callers pass
 * the signed-in account. */
export async function loadTraktSyncs(user: { id: string; role: string | null | undefined }): Promise<TraktSyncsState> {
  const [syncs, clientId] = await Promise.all([
    listTraktSyncs(user.role === "admin" ? "all" : { userId: user.id }),
    getTraktClientId().catch(() => null),
  ]);
  return { syncs, available: Boolean(clientId) };
}

export async function getTraktSync(id: string): Promise<TraktSync | null> {
  const all = await listTraktSyncs("all");
  return all.find((sync) => sync.id === id) ?? null;
}

/** The sync, if `actor` may change it: their own, or anyone's for the admin. */
async function ownedRow(actor: Actor, id: string): Promise<Row | null> {
  const [row] = await db.select().from(traktSyncs).where(eq(traktSyncs.id, id)).limit(1);
  if (!row) return null;
  if (row.userId !== actor.id && actor.role !== "admin") return null;
  return row;
}

// ── Changing ───────────────────────────────────────────────────────────────

/** Starts keeping a public Trakt list or watchlist in sync for `actor`.
 * Body: `{ url, movies?, tv?, requestExisting? }`. With requestExisting
 * false (the default) only titles added to the list from now on are
 * requested; what's on it already is noted and left alone. The list is read
 * once here, so a private or mistyped one is refused straight away. */
export async function createTraktSync(
  actor: Actor,
  body: Record<string, unknown>,
): Promise<CoreResult<{ sync: TraktSync; requestExisting: boolean }>> {
  const url = typeof body.url === "string" ? body.url : "";
  const list = url ? parseTraktUrl(url) : null;
  if (!list) {
    return await failT("invalid", "server.pasteTraktLink");
  }
  for (const key of ["movies", "tv", "requestExisting"]) {
    if (body[key] !== undefined && typeof body[key] !== "boolean") return await failT("invalid", "server.fieldTrueOrFalse", { field: key });
  }
  const movies = (body.movies as boolean | undefined) ?? true;
  const tv = (body.tv as boolean | undefined) ?? true;
  const requestExisting = (body.requestExisting as boolean | undefined) ?? false;
  if (!movies && !tv) return await failT("invalid", "server.pickMoviesOrTv");
  if (!can(actor, requestPermission("movie", false)) && !can(actor, requestPermission("tv", false))) {
    return await failT("forbidden", "server.nothingToSync");
  }

  const clientId = await getTraktClientId();
  if (!clientId) return await failT("conflict", "server.traktNotConnected");

  const [{ n }] = await db.select({ n: count() }).from(traktSyncs).where(eq(traktSyncs.userId, actor.id));
  if (Number(n) >= MAX_SYNCS_PER_MEMBER) {
    return await failT("conflict", "server.tooManyTraktSyncs", { count: MAX_SYNCS_PER_MEMBER });
  }

  const items = await readList(clientId, list);
  if (items === "missing") return await failT("upstream", "server.traktListUnreadable");
  if (items === "unreachable") return await failT("upstream", "server.traktUnreachableNow");

  // One transaction: a scheduled check can't see the new sync before what's
  // on the list now is noted as already there.
  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(traktSyncs)
      .values({
        userId: actor.id,
        kind: list.kind,
        username: list.username.toLowerCase(),
        slug: list.kind === "list" ? list.slug.toLowerCase() : "",
        syncMovies: movies,
        syncTv: tv,
        lastSyncedAt: requestExisting ? null : new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (!inserted || requestExisting) return inserted ?? null;
    // What's on it now counts as handled: only what's added later is asked for.
    const existing = pendingTraktItems(items, { movies: true, tv: true }, new Set());
    for (let i = 0; i < existing.length; i += 500) {
      await tx
        .insert(traktSyncItems)
        .values(
          existing.slice(i, i + 500).map((item) => ({
            userId: actor.id,
            mediaType: item.mediaType,
            tmdbId: item.tmdbId,
            outcome: "existing" as const,
            syncId: inserted.id,
          })),
        )
        .onConflictDoNothing();
    }
    return inserted;
  });
  if (!row) return await failT("conflict", "server.traktAlreadySynced");

  const sync = await getTraktSync(row.id);
  if (!sync) return await failT("internal", "server.traktSyncUnreadable");
  // The first check (a long list with auto-approve can take a while) runs
  // in the background; lastSyncedAt fills in when it's done.
  if (requestExisting) {
    void syncTraktSync(row.id, actor.id).catch((err) => console.error("[trakt-sync] first check failed:", err));
  }
  return { ok: true, sync, requestExisting };
}

/** Which kinds it requests: `{ movies?, tv? }`. */
export async function updateTraktSync(actor: Actor, id: string, body: Record<string, unknown>): Promise<CoreResult<{ sync: TraktSync }>> {
  for (const key of ["movies", "tv"]) {
    if (body[key] !== undefined && typeof body[key] !== "boolean") return await failT("invalid", "server.fieldTrueOrFalse", { field: key });
  }
  const movies = body.movies as boolean | undefined;
  const tv = body.tv as boolean | undefined;
  if (movies === undefined && tv === undefined) return await failT("invalid", "server.sendMoviesOrTv");
  const row = await ownedRow(actor, id);
  if (!row) return await failT("not_found", "server.traktSyncGone");
  const next = { movies: movies ?? row.syncMovies, tv: tv ?? row.syncTv };
  if (!next.movies && !next.tv) return await failT("invalid", "server.pickMoviesOrTvOrRemove");
  await db.update(traktSyncs).set({ syncMovies: next.movies, syncTv: next.tv }).where(eq(traktSyncs.id, id));
  const sync = await getTraktSync(id);
  return sync ? { ok: true, sync } : await failT("not_found", "server.traktSyncGone");
}

/** Stops syncing. What it requested stays requested, and the titles it
 * handled stay handled (so adding it back doesn't re-ask for declined ones). */
export async function deleteTraktSync(actor: Actor, id: string): Promise<CoreResult> {
  const row = await ownedRow(actor, id);
  if (!row) return await failT("not_found", "server.traktSyncGone");
  await db.delete(traktSyncs).where(eq(traktSyncs.id, id));
  return { ok: true };
}

/** May `actor` see or check this sync? Their own, or the admin. */
export async function canUseTraktSync(actor: Actor, id: string): Promise<boolean> {
  return (await ownedRow(actor, id)) !== null;
}

// ── Syncing ────────────────────────────────────────────────────────────────

type SyncOutcome = { requested: number };

async function runTraktSync(id: string): Promise<SyncOutcome> {
  const [row] = await db.select().from(traktSyncs).where(eq(traktSyncs.id, id)).limit(1);
  if (!row) return { requested: 0 };
  const setState = (values: Partial<typeof traktSyncs.$inferInsert>) =>
    db.update(traktSyncs).set(values).where(eq(traktSyncs.id, id));

  const clientId = await getTraktClientId();
  if (!clientId) {
    await setState({ lastError: storedError(NOT_CONNECTED) });
    return { requested: 0 };
  }
  const [user] = await db
    .select({ role: users.role, permissions: users.permissions })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);
  if (!user) return { requested: 0 };

  const list = parsedOf(row);
  const items = await readList(clientId, list);
  if (items === "missing" || items === "unreachable") {
    await setState({ lastError: storedError(items === "missing" ? UNREADABLE : UNREACHABLE) });
    return { requested: 0 };
  }

  const handledRows = await db
    .select({ mediaType: traktSyncItems.mediaType, tmdbId: traktSyncItems.tmdbId })
    .from(traktSyncItems)
    .where(eq(traktSyncItems.userId, row.userId));
  const handled = new Set(handledRows.map((r) => `${r.mediaType}:${r.tmdbId}`));
  // A kind the member may not request isn't tried (nor noted), so it's
  // picked up if the admin allows it later.
  const types = {
    movies: row.syncMovies && can(user, requestPermission("movie", false)),
    tv: row.syncTv && can(user, requestPermission("tv", false)),
  };
  const pending = pendingTraktItems(items, types, handled);

  const viewer = { userId: row.userId, isAdmin: user.role === "admin", libraryOwnerId: await getLibraryOwnerUserId(row.userId) };
  const [movieQuota, tvQuota] = await Promise.all([getQuota(row.userId, "movie"), getQuota(row.userId, "tv")]);
  const left = { movie: movieQuota?.remaining ?? Infinity, tv: tvQuota?.remaining ?? Infinity };
  let limited = false;
  let requested = 0;
  const newRequestIds: string[] = [];

  for (const item of pending.slice(0, MAX_NEW_REQUESTS_PER_SYNC)) {
    // Out of requests of this kind: it waits, untried, until a slot frees.
    if (left[item.mediaType] <= 0) {
      limited = true;
      continue;
    }
    // Without TMDb it can't tell a show the library already has; nobody's
    // waiting on it, so it waits for TMDb instead.
    const known = await getOrFetchTitle(item.mediaType, item.tmdbId).catch(() => null);
    if (!known) continue;
    const result = await createRequest(viewer, {
      mediaType: item.mediaType,
      tmdbId: item.tmdbId,
      title: known.name || item.title,
      posterPath: known.posterPath ?? null,
      // Reviewers get one alert for the list's whole batch, below.
      quiet: true,
    }).catch(() => null);

    let outcome: "requested" | "skipped" | null;
    if (result?.ok) outcome = "requested";
    // Already owned or requested, not requestable, or blocked by the admin:
    // noted, and not asked for again.
    else if (result && (result.code === "conflict" || result.code === "invalid" || result.code === "forbidden")) {
      outcome = "skipped";
    }
    // A request limit reached meanwhile: waits like the ones above.
    else if (result && result.code === "rate_limited") {
      limited = true;
      outcome = null;
    }
    // TMDb or the database hiccuped: tried again next check.
    else outcome = null;
    if (!outcome) continue;

    if (result?.ok) {
      requested++;
      newRequestIds.push(result.requestId);
      left[item.mediaType]--;
    }
    await db
      .insert(traktSyncItems)
      .values({
        userId: row.userId,
        mediaType: item.mediaType,
        tmdbId: item.tmdbId,
        outcome,
        syncId: row.id,
        requestId: result?.ok ? result.requestId : null,
      })
      .onConflictDoNothing()
      .catch((err) => console.error("[trakt-sync] couldn't record a handled title:", err));
  }

  await setState({ lastSyncedAt: new Date(), lastError: limited ? storedError(LIMITED) : null });
  await notifyReviewersOfTraktSync(row.userId, newRequestIds, traktListName(list)).catch(() => undefined);
  return { requested };
}

/** Checks one list now. Overlapping calls for the list share one run, and
 * one member's lists run one at a time (they share what's been handled). */
export function syncTraktSync(id: string, userId: string): Promise<SyncOutcome> {
  return singleFlight(`trakt-sync:${id}`, () => runExclusive(`trakt-sync-user:${userId}`, () => runTraktSync(id)));
}

/** The scheduled job: every list of every member, one at a time. */
export async function syncAllTraktSyncs(): Promise<void> {
  const rows = await db
    .select({ id: traktSyncs.id, userId: traktSyncs.userId })
    .from(traktSyncs)
    .orderBy(asc(traktSyncs.createdAt));
  for (const row of rows) {
    await syncTraktSync(row.id, row.userId).catch((err) => {
      console.error(`[trakt-sync] sync of ${row.id} failed:`, err);
    });
  }
}
