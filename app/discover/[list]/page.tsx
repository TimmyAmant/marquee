import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InfiniteResultsGrid } from "@/components/infinite-results-grid";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { DISCOVER_LIST_TITLES, parseDiscoverList } from "@/lib/discover/lists";
import { fetchDiscoverListPage } from "@/lib/pages/discover-lists";

export async function generateMetadata({ params }: { params: Promise<{ list: string }> }): Promise<Metadata> {
  const list = parseDiscoverList((await params).list);
  return { title: list ? `${DISCOVER_LIST_TITLES[list]} — Marquee` : "Marquee" };
}

/**
 * A Discover shelf's "See all" (Recently Added, Trending, Upcoming Movies,
 * Upcoming Series): the whole list as a grid, first page server-rendered and
 * the rest by infinite scroll. Shared with GET /api/v1/discover/lists/{list}.
 */
export default async function DiscoverListPage({ params }: { params: Promise<{ list: string }> }) {
  const list = parseDiscoverList((await params).list);
  if (!list) notFound();

  const viewer = await getViewerContext();
  const first = await fetchDiscoverListPage(list, 1, viewer);
  const mixed = list === "trending" || list === "recently-added";

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
          <h1 className="font-display text-3xl text-text-primary">{first.title}</h1>
        </div>

        <InfiniteResultsGrid
          key={list}
          initialItems={first.items}
          initialHasNextPage={first.page < first.totalPages}
          list={list}
          signedIn={Boolean(viewer.session)}
          showTypeLabel={mixed}
          emptyMessage={
            list === "recently-added"
              ? "Nothing added to your Plex or Jellyfin library yet."
              : "Nothing here right now — TMDb didn't send anything back."
          }
        />
      </div>
    </div>
  );
}
