"use server";

import { getViewerContext } from "@/lib/integrations/library-owner";
import { fetchDiscoverItems, type DiscoverFetchParams, type DiscoverCardData } from "@/app/discover/fetch-items";
import { pickSurprise, type SurpriseMeParams as SurpriseParams } from "@/lib/discover/surprise";

export type SurpriseMeParams = SurpriseParams;

/** Infinite-scroll "load more" for /movies and /series — same per-page
 * fetch+enrich logic the initial server render uses (see fetch-items.ts),
 * just triggered by a client-side IntersectionObserver instead of a
 * server-rendered "Next" link. */
export async function loadMoreDiscoverItems(
  params: DiscoverFetchParams,
): Promise<{ items: DiscoverCardData[]; hasNextPage: boolean }> {
  const viewer = await getViewerContext();
  // Actions don't get the proxy's sign-in redirect for free, so check here
  // too rather than serve TMDb pages to anyone who can reach the endpoint.
  if (!viewer.session) return { items: [], hasNextPage: false };
  const { items, hasNextPage } = await fetchDiscoverItems(params, viewer);
  return { items, hasNextPage };
}

export type SurpriseMeResult = { href?: string; error?: string };

/** Picks one random title for the current filters — see pickSurprise. */
export async function surpriseMeAction(params: SurpriseMeParams): Promise<SurpriseMeResult> {
  const viewer = await getViewerContext();
  if (!viewer.session) return { error: "Sign in to use Surprise me." };
  const result = await pickSurprise(viewer, params);
  return result.ok ? { href: `/title/${result.mediaType}/${result.tmdbId}` } : { error: result.error };
}
