import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InfiniteResultsGrid } from "@/components/infinite-results-grid";
import { StatusLegend } from "@/components/status-legend";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { DISCOVER_LIST_TITLES } from "@/lib/discover/lists";
import { fetchResolvedListPage, resolveDiscoverList } from "@/lib/pages/discover-lists";

export async function generateMetadata({ params }: { params: Promise<{ list: string }> }): Promise<Metadata> {
  const resolved = await resolveDiscoverList((await params).list);
  if (!resolved) return { title: "Marquee" };
  const title = resolved.type === "custom" ? resolved.shelf.title : DISCOVER_LIST_TITLES[resolved.list];
  return { title: `${title} — Marquee` };
}

/**
 * A Discover shelf's "See all" (Recently Added, Trending, Upcoming Movies,
 * Upcoming Series, and every row the admin added in Settings → Discover):
 * the whole list as a grid, first page server-rendered and the rest by
 * infinite scroll. Shared with GET /api/v1/discover/lists/{list}.
 */
export default async function DiscoverListPage({ params }: { params: Promise<{ list: string }> }) {
  const resolved = await resolveDiscoverList((await params).list);
  if (!resolved) notFound();

  const viewer = await getViewerContext();
  const first = await fetchResolvedListPage(resolved, 1, viewer);
  const mixed =
    resolved.type === "builtIn"
      ? resolved.list === "trending" || resolved.list === "recently-added"
      : new Set(first.items.map((item) => item.mediaType)).size > 1 || resolved.shelf.source?.mediaType === "all";

  const emptyMessage =
    resolved.type === "builtIn"
      ? resolved.list === "recently-added"
        ? "Nothing added to your Plex or Jellyfin library yet."
        : "Nothing here right now — TMDb didn't send anything back."
      : resolved.shelf.kind === "library"
        ? "Nothing added to your Plex or Jellyfin library yet."
        : resolved.shelf.kind === "traktList"
          ? "Nothing here right now — Trakt didn't send anything back. The list has to be public, and Trakt connected in Settings."
          : "Nothing here right now — TMDb didn't send anything back.";

  return (
    <div className="rail-bleed relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10 h-96"
        style={{
          background:
            "radial-gradient(120% 60% at 50% -10%, rgba(224,166,62,0.14) 0%, rgba(10,10,12,0) 60%)",
        }}
      />

      <div className="flex flex-col gap-8 px-4 py-6 sm:px-7 sm:py-7">
        <div className="flex flex-col gap-1">
          <Link href="/discover" className="text-xs text-text-muted transition-colors hover:text-accent">
            ← Discover
          </Link>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="font-display text-3xl text-text-primary">{first.title}</h1>
            {viewer.session && <StatusLegend />}
          </div>
        </div>

        <InfiniteResultsGrid
          key={first.list}
          initialItems={first.items}
          initialHasNextPage={first.page < first.totalPages}
          list={first.list}
          signedIn={Boolean(viewer.session)}
          showTypeLabel={mixed}
          emptyMessage={emptyMessage}
        />
      </div>
    </div>
  );
}
