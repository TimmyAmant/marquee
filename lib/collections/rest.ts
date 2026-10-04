import type { FranchiseItem } from "@/components/franchise-row";
import { fail, type CoreResult } from "@/lib/core-result";
import { addTitleToLibrary } from "@/lib/arr/title-actions";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import type { ViewerIdentity } from "@/lib/integrations/library-owner";
import { loadFranchise } from "@/lib/pages/title";
import { getBlockedTitleKeys } from "@/lib/requests/blocklist";
import { requestAllMissing } from "@/lib/requests/request-all";
import { franchiseMissingItems, franchiseRequestableItems } from "@/lib/title-meta";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import type { TmdbMovieDetails } from "@/lib/tmdb/client";
import { permissionMap } from "@/lib/users/permissions";
import { getAccess } from "@/lib/users/access";
import { getT } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n/translator";

// "The rest of the collection": once a movie has been added (the admin) or
// requested (a member), the other movies of its TMDb collection the library
// doesn't have yet are offered in one go — "Dune is part of the Dune
// Collection. Add the other 2 too?". The set is the franchise row's Add all
// / Request all set (lib/title-meta.ts) less the movie itself, worked out on
// the server each time; adding goes through addTitleToLibrary and requesting
// through requestAllMissing, so every rule of those applies.

type Viewer = Extract<ViewerIdentity, { userId: string }>;

export type CollectionRest = {
  collectionId: number;
  name: string;
  /** What "Add them too" does for this viewer. */
  action: "add" | "request";
  items: FranchiseItem[];
};

export type CollectionRestOutcome = {
  action: "add" | "request";
  total: number;
  /** Added (the admin) or requested (a member). */
  done: number;
  failed: { tmdbId: number; title: string; error: string }[];
  /** "Added all 2." / "Requested 1 of 2. …" */
  message: string;
};

/** The movie's collection and the rest of it this viewer can add or
 * request, or null when there's none (not a movie, not in a collection,
 * nothing left, or nothing they may do about it). */
export async function collectionRest(viewer: Viewer, tmdbId: number): Promise<CollectionRest | null> {
  const title = await getOrFetchTitle("movie", tmdbId).catch(() => null);
  if (!title) return null;
  const raw = title.rawTmdb as TmdbMovieDetails | null;
  if (!raw?.belongs_to_collection) return null;

  const franchise = await loadFranchise(viewer, "movie", tmdbId, raw);
  if (!franchise.franchiseTitle || franchise.collectionId === undefined) return null;

  let keys: { tmdbId: number }[];
  if (viewer.isAdmin) {
    const radarr = await getArrCredential(viewer.userId, "radarr").catch(() => null);
    keys = franchiseMissingItems(
      franchise.franchiseItems,
      franchise.franchiseStatusMap,
      { movie: isArrFullyConfigured(radarr), tv: false },
      true,
    );
  } else {
    const [blocked, access] = await Promise.all([
      getBlockedTitleKeys().catch(() => new Set<string>()),
      getAccess(viewer.userId),
    ]);
    keys = franchiseRequestableItems(
      franchise.franchiseItems,
      franchise.franchiseStatusMap,
      franchise.franchiseRequestStatusMap,
      blocked,
      false,
      permissionMap(access ?? { role: "member", permissions: [] }),
    );
  }
  const wanted = new Set(keys.map((k) => k.tmdbId));
  wanted.delete(tmdbId);
  const items = franchise.franchiseItems.filter((item) => wanted.has(item.tmdbId));
  if (items.length === 0) return null;
  return {
    collectionId: franchise.collectionId,
    name: franchise.franchiseTitle,
    action: viewer.isAdmin ? "add" : "request",
    items,
  };
}

/** The admin's result in words. Pure. */
export function addRestMessage(t: Translator, total: number, added: number): string {
  if (total === 0) return t("notify.requestAllNothing");
  return added === total
    ? t("title.addAllDone", { count: added })
    : t("title.addAllPartial", { added, total, failed: total - added });
}

/** "Add them too": the admin adds the rest to Radarr, a member requests it. */
export async function addCollectionRest(viewer: Viewer, tmdbId: number): Promise<CoreResult<CollectionRestOutcome>> {
  const t = await getT();
  if (!viewer.isAdmin) {
    const result = await requestAllMissing(viewer, "movie", tmdbId, true);
    if (!result.ok) return result;
    return {
      ok: true,
      action: "request",
      total: result.total,
      done: result.requested,
      failed: result.refused.map((r) => ({ tmdbId: r.tmdbId, title: r.title, error: r.error })),
      message: result.message,
    };
  }

  const rest = await collectionRest(viewer, tmdbId);
  if (!rest) {
    const title = await getOrFetchTitle("movie", tmdbId).catch(() => null);
    if (!title) return fail("not_found", t("notify.noSuchTitle"));
    const raw = title.rawTmdb as TmdbMovieDetails | null;
    if (!raw?.belongs_to_collection) return fail("not_found", t("notify.notInCollection"));
    return { ok: true, action: "add", total: 0, done: 0, failed: [], message: addRestMessage(t, 0, 0) };
  }
  const failed: CollectionRestOutcome["failed"] = [];
  let done = 0;
  // One at a time: Radarr's lookups and adds aren't worth racing.
  for (const item of rest.items) {
    const result = await addTitleToLibrary(viewer.userId, "movie", item.tmdbId).catch(() => ({
      ok: false as const,
      error: t("common.somethingWentWrong"),
    }));
    if (result.ok) done++;
    else failed.push({ tmdbId: item.tmdbId, title: item.name, error: "error" in result ? result.error : "" });
  }
  return { ok: true, action: "add", total: rest.items.length, done, failed, message: addRestMessage(t, rest.items.length, done) };
}
