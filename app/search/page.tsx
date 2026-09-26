import { SearchBar } from "@/components/search-bar";
import { PosterGrid } from "@/components/poster-grid";
import { PosterCard } from "@/components/poster-card";
import { StatusBadge } from "@/components/status-badge";
import { StatusLegend } from "@/components/status-legend";
import { StudioChip } from "@/components/studio-chip";
import { FavoriteButton } from "@/components/favorite-button";
import { QuickAddButton } from "@/components/quick-add-button";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { loadSearchResults } from "@/lib/pages/search";
import type { MediaType } from "@/lib/db/schema";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim();

  if (!query) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="font-display text-3xl text-text-primary">Search Marquee</h1>
        <div className="mt-8">
          {/* The menu's Search item lands here, ready to type. */}
          <SearchBar autoFocus />
        </div>
      </div>
    );
  }

  // Shared with GET /api/v1/search.
  const viewer = await getViewerContext();
  const {
    people,
    companyResults,
    titleResults,
    themeLabel,
    themeItems,
    hasResults,
    statusMap,
    arrConfigured,
    favoritedPersonIds,
    favoritedCompanyIds,
    favoritedTitle,
  } = await loadSearchResults(viewer, query);

  return (
    <div className="px-4 py-6 sm:pl-7 sm:pr-7 sm:py-7">
      {!hasResults && (
        <p className="text-center text-text-secondary">
          No results for &ldquo;{query}&rdquo;.
        </p>
      )}

      {people.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 font-display text-xl text-text-primary">People</h2>
          <PosterGrid>
            {people.map((person) => (
              <PosterCard
                key={person.id}
                href={`/person/${person.id}`}
                posterPath={person.profile_path ?? null}
                name={person.name ?? ""}
                subtitle={person.known_for_department}
                favoriteAction={
                  viewer.session && (
                    <FavoriteButton
                      entityType="person"
                      tmdbId={person.id}
                      initialFavorited={favoritedPersonIds.has(person.id)}
                      compact
                    />
                  )
                }
              />
            ))}
          </PosterGrid>
        </section>
      )}

      {companyResults.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 font-display text-xl text-text-primary">Studios</h2>
          <div className="flex flex-wrap gap-3">
            {companyResults.map((company) => (
              <StudioChip
                key={company.tmdbId}
                tmdbId={company.tmdbId}
                name={company.name}
                logoPath={company.logoPath}
                favoriteAction={
                  viewer.session && (
                    <FavoriteButton
                      entityType="company"
                      tmdbId={company.tmdbId}
                      initialFavorited={favoritedCompanyIds.has(company.tmdbId)}
                      compact
                    />
                  )
                }
              />
            ))}
          </div>
        </section>
      )}

      {titleResults.length > 0 && (
        <section className="mb-12">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-xl text-text-primary">Titles</h2>
            {viewer.session && <StatusLegend />}
          </div>
          <PosterGrid>
            {titleResults.map((title) => {
              const mediaType = title.media_type as MediaType;
              const status = statusMap.get(`${mediaType}:${title.id}`);
              const canQuickAdd = Boolean(viewer.session) && arrConfigured[mediaType] && !status;
              return (
                <PosterCard
                  key={`${mediaType}-${title.id}`}
                  href={`/title/${mediaType}/${title.id}`}
                  posterPath={title.poster_path ?? null}
                  name={title.title || title.name || ""}
                  year={(title.release_date || title.first_air_date || "").slice(0, 4)}
                  badge={status && <StatusBadge status={status} compact />}
                  status={status}
                  favoriteAction={
                    viewer.session && (
                      <FavoriteButton
                        entityType={mediaType}
                        tmdbId={title.id}
                        initialFavorited={favoritedTitle(mediaType, title.id)}
                        compact
                      />
                    )
                  }
                  quickAction={
                    canQuickAdd ? <QuickAddButton mediaType={mediaType} tmdbId={title.id} /> : undefined
                  }
                />
              );
            })}
          </PosterGrid>
        </section>
      )}

      {themeItems.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-xl text-text-primary">{`${themeLabel} movies & TV`}</h2>
            {viewer.session && titleResults.length === 0 && <StatusLegend />}
          </div>
          <PosterGrid>
            {themeItems.map((item) => {
              const status = statusMap.get(`${item.mediaType}:${item.tmdbId}`);
              const canQuickAdd = Boolean(viewer.session) && arrConfigured[item.mediaType] && !status;
              return (
                <PosterCard
                  key={`${item.mediaType}-${item.tmdbId}`}
                  href={`/title/${item.mediaType}/${item.tmdbId}`}
                  posterPath={item.posterPath}
                  name={item.name}
                  year={item.year}
                  badge={status && <StatusBadge status={status} compact />}
                  status={status}
                  favoriteAction={
                    viewer.session && (
                      <FavoriteButton
                        entityType={item.mediaType}
                        tmdbId={item.tmdbId}
                        initialFavorited={favoritedTitle(item.mediaType, item.tmdbId)}
                        compact
                      />
                    )
                  }
                  quickAction={
                    canQuickAdd ? (
                      <QuickAddButton mediaType={item.mediaType} tmdbId={item.tmdbId} />
                    ) : undefined
                  }
                />
              );
            })}
          </PosterGrid>
        </section>
      )}
    </div>
  );
}
