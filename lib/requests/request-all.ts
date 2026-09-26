import { revalidatePathSafely as revalidatePath } from "@/lib/cache/revalidate";
import type { MediaType } from "@/lib/db/schema";
import type { ViewerIdentity } from "@/lib/integrations/library-owner";
import { loadFranchise } from "@/lib/pages/title";
import { getBlockedTitleKeys } from "@/lib/requests/blocklist";
import { createRequest } from "@/lib/requests/mutate";
import { notifyReviewersOfCollection } from "@/lib/requests/alerts";
import { franchiseRequestableItems } from "@/lib/title-meta";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import type { TmdbMovieDetails, TmdbTvDetails } from "@/lib/tmdb/client";
import { fail, type CoreResult } from "@/lib/core-result";

// "Request all N missing" on a franchise row, for household members — the
// admin's "Add all" counterpart. The set is worked out again here from the
// title's franchise (never taken from the client), and each title goes
// through createRequest on its own, so the blocklist, request limits,
// auto-approval and the duplicate checks all apply exactly as they do to a
// poster's Request button. Reviewers get one alert for the lot.

export type RequestAllRefusal = { mediaType: MediaType; tmdbId: number; title: string; error: string };

export type RequestAllOutcome = {
  /** How many titles were in the set when the member pressed it. */
  total: number;
  requested: number;
  refused: RequestAllRefusal[];
  /** "Requested 3 of 4. You've used your 2 movie requests for a week." */
  message: string;
};

/** The result in words: every refusal reason once, most common first. Pure. */
export function requestAllMessage(total: number, requested: number, refusals: { error: string }[]): string {
  if (total === 0) return "Nothing left to request here.";
  if (refusals.length === 0) return requested === 1 ? "Requested it." : `Requested all ${requested}.`;
  const counts = new Map<string, number>();
  for (const { error } of refusals) counts.set(error, (counts.get(error) ?? 0) + 1);
  const reasons = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([error]) => (/[.!?]$/.test(error) ? error : `${error}.`));
  const head = requested === 0 ? `Couldn't request any of the ${total}.` : `Requested ${requested} of ${total}.`;
  return [head, ...reasons].join(" ");
}

export async function requestAllMissing(
  viewer: Extract<ViewerIdentity, { userId: string }>,
  mediaType: MediaType,
  tmdbId: number,
): Promise<CoreResult<RequestAllOutcome>> {
  if (viewer.isAdmin) return fail("forbidden", "The admin adds titles straight to the library — use Add all.");

  const title = await getOrFetchTitle(mediaType, tmdbId).catch(() => null);
  if (!title) return fail("not_found", "No such title on TMDb.");
  const raw = title.rawTmdb as (TmdbMovieDetails | TmdbTvDetails) | null;

  const [franchise, blockedKeys] = await Promise.all([
    loadFranchise(viewer, mediaType, tmdbId, raw),
    getBlockedTitleKeys().catch(() => new Set<string>()),
  ]);
  if (!franchise.franchiseTitle) return fail("not_found", "This title isn't part of a collection.");

  const wanted = franchiseRequestableItems(
    franchise.franchiseItems,
    franchise.franchiseStatusMap,
    franchise.franchiseRequestStatusMap,
    blockedKeys,
    viewer.isAdmin,
  );
  const byKey = new Map(franchise.franchiseItems.map((item) => [`${item.mediaType}:${item.tmdbId}`, item]));

  const requestIds: string[] = [];
  const refused: RequestAllRefusal[] = [];
  // Once a type's request limit is reached every later one of that type
  // would be refused the same way — no need to ask again.
  const limitReached = new Map<MediaType, string>();
  for (const target of wanted) {
    const item = byKey.get(`${target.mediaType}:${target.tmdbId}`);
    const name = item?.name ?? "";
    const limited = limitReached.get(target.mediaType);
    if (limited) {
      refused.push({ ...target, title: name, error: limited });
      continue;
    }
    const result = await createRequest(viewer, {
      mediaType: target.mediaType,
      tmdbId: target.tmdbId,
      title: name,
      posterPath: item?.posterPath ?? null,
      quiet: true,
    }).catch(() => ({ ok: false as const, code: "internal" as const, error: "Something went wrong." }));
    if (result.ok) {
      requestIds.push(result.requestId);
    } else {
      if (result.code === "rate_limited") limitReached.set(target.mediaType, result.error);
      refused.push({ ...target, title: name, error: result.error });
    }
  }

  await notifyReviewersOfCollection(viewer.userId, requestIds, franchise.franchiseTitle).catch(() => undefined);
  revalidatePath(`/title/${mediaType}/${tmdbId}`);

  return {
    ok: true,
    total: wanted.length,
    requested: requestIds.length,
    refused,
    message: requestAllMessage(wanted.length, requestIds.length, refused),
  };
}
