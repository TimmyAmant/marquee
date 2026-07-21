import Link from "next/link";
import Image from "next/image";
import { PosterCard } from "@/components/poster-card";
import { StatusBadge } from "@/components/status-badge";
import { PosterRow, PosterRowItem } from "@/components/poster-row";
import { getTrendingAll, getUpcomingMovies } from "@/lib/tmdb/client";
import { getLibraryStatusMap, getLibrarySummary } from "@/lib/library/query";
import { getPendingRequestCount, getMyPendingRequestCount } from "@/lib/requests/query";
import { getRecentDownloads } from "@/lib/notifications/query";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import { formatBytes } from "@/lib/format";
import { getViewerContext } from "@/lib/integrations/library-owner";
import type { MediaType } from "@/lib/db/schema";

export default async function Home() {
  const viewer = await getViewerContext();

  const [trending, upcoming, librarySummary, pendingRequestCount, recentDownloads] = await Promise.all([
    getTrendingAll().catch(() => ({ results: [] })),
    getUpcomingMovies().catch(() => ({ results: [] })),
    viewer.libraryOwnerId ? getLibrarySummary(viewer.libraryOwnerId) : Promise.resolve(null),
    viewer.session
      ? viewer.isAdmin
        ? getPendingRequestCount()
        : getMyPendingRequestCount(viewer.userId)
      : Promise.resolve(0),
    viewer.libraryOwnerId ? getRecentDownloads(viewer.libraryOwnerId) : Promise.resolve([]),
  ]);

  // The notifications table (where "downloaded" events come from) has no
  // posterPath column, unlike requests — fetch each from the title cache
  // (cheap: local DB hit unless this particular title was never viewed/
  // synced before) so the feed looks like every other poster-led list.
  const recentDownloadsWithPosters = await Promise.all(
    recentDownloads.map(async (d) => ({
      ...d,
      posterPath: (await getOrFetchTitle(d.mediaType, d.tmdbId).catch(() => null))?.posterPath ?? null,
    })),
  );

  const trendingItems = trending.results
    .filter((item) => item.media_type === "movie" || item.media_type === "tv")
    .slice(0, 16);

  // TMDb's /movie/upcoming endpoint is really "currently in theaters or
  // about to be" for the given region, not strictly "release date is in the
  // future" — it can include already-released classics that got a limited
  // anniversary re-release (e.g. Willy Wonka & the Chocolate Factory, 1971).
  // Filter to titles whose actual release date hasn't happened yet so
  // "Coming soon" doesn't show something that's been out for decades.
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcomingItems = upcoming.results
    .filter((item) => item.release_date && item.release_date >= todayStr)
    .slice(0, 16);

  const statusMap = viewer.libraryOwnerId
    ? await getLibraryStatusMap(viewer.libraryOwnerId, [
        ...trendingItems.map((i) => ({ mediaType: i.media_type as MediaType, tmdbId: i.id })),
        ...upcomingItems.map((i) => ({ mediaType: "movie" as MediaType, tmdbId: i.id })),
      ])
    : new Map();

  return (
    <div className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 60% at 50% -10%, rgba(224,166,62,0.14) 0%, rgba(10,10,12,0) 60%)",
        }}
      />

      <section className="mx-auto flex max-w-4xl flex-col items-center px-6 pb-20 pt-28 text-center sm:pt-36">
        <p className="mb-5 text-xs font-medium uppercase tracking-[0.25em] text-accent">
          Every role. Every studio. One database.
        </p>
        <h1 className="font-display text-5xl leading-[1.05] tracking-tight text-text-primary sm:text-6xl">
          Search a name.
          <br />
          Get the whole story.
        </h1>
        <p className="mt-6 max-w-xl text-balance text-lg text-text-secondary">
          Look up any actor and see every role they&apos;ve ever played, or
          browse an entire studio&apos;s catalog. See instantly what&apos;s
          already in your Plex library — and send the rest straight to Sonarr
          or Radarr.
        </p>
      </section>

      {viewer.session && (librarySummary || pendingRequestCount > 0) && (
        <section className="mx-auto max-w-6xl px-6 pb-14">
          <div className="rounded-2xl border border-border bg-bg-1 px-6 py-4">
            <div className="flex flex-wrap gap-6 text-sm">
              {librarySummary && librarySummary.movieCount > 0 && (
                <div>
                  <span className="font-display text-2xl text-text-primary">
                    {librarySummary.movieCount}
                  </span>
                  <span className="ml-1.5 text-text-muted">movies</span>
                </div>
              )}
              {librarySummary && librarySummary.tvCount > 0 && (
                <div>
                  <span className="font-display text-2xl text-text-primary">
                    {librarySummary.tvCount}
                  </span>
                  <span className="ml-1.5 text-text-muted">TV shows</span>
                </div>
              )}
              {librarySummary && librarySummary.totalBytes > 0 && (
                <div>
                  <span className="font-display text-2xl text-text-primary">
                    {formatBytes(librarySummary.totalBytes)}
                  </span>
                  <span className="ml-1.5 text-text-muted">on disk</span>
                </div>
              )}
              {pendingRequestCount > 0 && (
                <Link href="/requests" className="transition-opacity hover:opacity-80">
                  <span className="font-display text-2xl text-accent">{pendingRequestCount}</span>
                  <span className="ml-1.5 text-text-muted">
                    {viewer.isAdmin ? "pending requests" : "of your requests pending"}
                  </span>
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      {recentDownloadsWithPosters.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 pb-14">
          <h2 className="mb-4 font-display text-xl text-text-primary">Recent downloads</h2>
          <div className="flex flex-col gap-2">
            {recentDownloadsWithPosters.map((d) => {
              const src = tmdbImageUrl(d.posterPath, "w92");
              return (
                <Link
                  key={d.id}
                  href={`/title/${d.mediaType}/${d.tmdbId}`}
                  className="flex items-center gap-4 rounded-xl border border-border bg-bg-1 p-3 transition-colors hover:border-border-strong"
                >
                  <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-bg-2">
                    {src && <Image src={src} alt="" fill sizes="40px" className="object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-primary">{d.title}</p>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      Downloaded {new Date(d.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {trendingItems.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 pb-14">
          <h2 className="mb-4 font-display text-xl text-text-primary">Trending this week</h2>
          <PosterRow>
            {trendingItems.map((item) => {
              const status = statusMap.get(`${item.media_type}:${item.id}`);
              return (
                <PosterRowItem key={`${item.media_type}-${item.id}`}>
                  <PosterCard
                    href={`/title/${item.media_type}/${item.id}`}
                    posterPath={item.poster_path}
                    name={item.title || item.name || ""}
                    year={(item.release_date || item.first_air_date || "").slice(0, 4)}
                    badge={status && <StatusBadge status={status} compact />}
                    status={status}
                  />
                </PosterRowItem>
              );
            })}
          </PosterRow>
        </section>
      )}

      {upcomingItems.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 pb-20">
          <h2 className="mb-4 font-display text-xl text-text-primary">Coming soon</h2>
          <PosterRow>
            {upcomingItems.map((item) => {
              const status = statusMap.get(`movie:${item.id}`);
              return (
                <PosterRowItem key={item.id}>
                  <PosterCard
                    href={`/title/movie/${item.id}`}
                    posterPath={item.poster_path}
                    name={item.title}
                    year={item.release_date?.slice(0, 4)}
                    badge={status && <StatusBadge status={status} compact />}
                    status={status}
                  />
                </PosterRowItem>
              );
            })}
          </PosterRow>
        </section>
      )}

      <section className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-6 pb-28 sm:grid-cols-3">
        {[
          {
            title: "Full filmographies",
            body: "Every movie and TV credit, character names included, sourced from TMDb and TVDB and kept in sync.",
          },
          {
            title: "Know what you own",
            body: "Connect Plex once and every title shows whether it's already sitting in your library.",
          },
          {
            title: "One click to download",
            body: "Missing something? Send it to Sonarr or Radarr without leaving the page.",
          },
        ].map((card) => (
          <div
            key={card.title}
            className="rounded-2xl border border-border bg-bg-1 p-6 transition-colors hover:border-border-strong"
          >
            <h3 className="font-display text-xl text-text-primary">
              {card.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              {card.body}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
