import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { SearchBar } from "@/components/search-bar";
import { Shelf } from "@/components/shelf";
import { PosterCard } from "@/components/poster-card";
import { PosterRowItem } from "@/components/poster-row";
import { StatusBadge } from "@/components/status-badge";
import { StatusLegend } from "@/components/status-legend";
import { FavoriteButton } from "@/components/favorite-button";
import { QuickAddButton } from "@/components/quick-add-button";
import { PersonTile, knownForLine } from "@/components/person-tile";
import { LogoCard } from "@/components/logo-card";
import { InfiniteResultsGrid } from "@/components/infinite-results-grid";
import { SearchSectionGrid } from "@/components/search-section-grid";
import { companyHref } from "@/lib/search/links";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { loadSearchResults, loadSearchSection, parseSearchSection, type SearchBlock, type SearchSectionKind, type SearchTitleCard } from "@/lib/pages/search";
import { getT } from "@/lib/i18n/server";
import { formatNumber } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n/translator";

type SearchParams = Promise<{ q?: string; type?: string }>;

/** Each section's heading, in the page's order. */
const SECTION_TITLES: Record<SearchSectionKind, MessageKey> = {
  movie: "discover.searchMovies",
  tv: "discover.searchSeries",
  person: "discover.searchPeople",
  company: "discover.searchStudiosNetworks",
};

const SECTION_PARAM: Record<SearchSectionKind, string> = { movie: "movie", tv: "tv", person: "person", company: "company" };

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { q } = await searchParams;
  const t = await getT();
  const query = q?.trim();
  return { title: query ? `${t("discover.searchResultsFor", { query })} — Marquee` : `${t("discover.searchTitle")} — Marquee` };
}

function seeAllHref(query: string, kind: SearchSectionKind): string {
  return `/search?q=${encodeURIComponent(query)}&type=${SECTION_PARAM[kind]}`;
}

/**
 * /search?q= — the results in sections, always in this order: Movies, TV
 * Shows, People, Studios & Networks (lib/search/rank.ts ranks inside each).
 * Each is a shelf with its total and a See all when TMDb has more than the
 * shelf shows; an empty one is left out. A genre or keyword the query names
 * ("horror", "natural disaster") gets its own shelf, first when that's what
 * the query is, last otherwise. /search?q=&type= is one section's See all.
 */
export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, type } = await searchParams;
  const query = q?.trim();
  const t = await getT();

  if (!query) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="font-display text-3xl text-text-primary">{t("discover.searchTitle")}</h1>
        <div className="mt-8">
          {/* The menu's Search item lands here, ready to type — or, coming
              back from a title picked here, with that search still open. */}
          <SearchBar autoFocus restoreOnBack />
        </div>
      </div>
    );
  }

  const viewer = await getViewerContext();
  const signedIn = Boolean(viewer.session);
  const section = parseSearchSection(type);
  if (section) return <SearchSectionPage query={query} kind={section} />;

  // Shared with GET /api/v1/search.
  const data = await loadSearchResults(viewer, query);

  const posterCard = (item: SearchTitleCard, withType = false) => (
    <PosterRowItem key={`${item.mediaType}-${item.tmdbId}`}>
      <PosterCard
        href={`/title/${item.mediaType}/${item.tmdbId}`}
        posterPath={item.posterPath}
        name={item.name}
        year={item.year ?? undefined}
        typeLabel={
          withType
            ? { mediaType: item.mediaType, text: item.mediaType === "movie" ? t("common.movie") : t("common.series") }
            : undefined
        }
        badge={item.status && <StatusBadge status={item.status} compact />}
        status={item.status}
        episodes={item.episodes}
        favoriteAction={
          signedIn && (
            <FavoriteButton entityType={item.mediaType} tmdbId={item.tmdbId} initialFavorited={item.favorited} compact />
          )
        }
        quickAction={item.canQuickAdd ? <QuickAddButton mediaType={item.mediaType} tmdbId={item.tmdbId} /> : undefined}
      />
    </PosterRowItem>
  );

  const count = (total: number) => formatNumber(t, total);
  const titleShelf = (kind: "movie" | "tv", page: typeof data.movies) =>
    page.items.length > 0 && (
      <Shelf
        key={kind}
        id={`search-${kind}`}
        title={t(SECTION_TITLES[kind])}
        count={count(page.totalResults)}
        seeAllHref={page.totalResults > page.items.length ? seeAllHref(query, kind) : undefined}
        seeAllText
      >
        {page.items.map((item) => posterCard(item))}
      </Shelf>
    );

  const themeShelf = data.theme && (
    <Shelf key="theme" id="search-theme" title={t("discover.themeHeading", { theme: data.theme.label })}>
      {data.theme.items.map((item) => posterCard(item, true))}
    </Shelf>
  );

  const peopleShelf = data.people.items.length > 0 && (
          <Shelf
            id="search-person"
            title={t(SECTION_TITLES.person)}
            count={count(data.people.totalResults)}
            seeAllHref={data.people.totalResults > data.people.items.length ? seeAllHref(query, "person") : undefined}
            seeAllText
            gap="tile"
          >
            {data.people.items.map((person) => (
              <div key={person.tmdbId} className="w-[112px] shrink-0 sm:w-[128px]">
                <PersonTile
                  tmdbId={person.tmdbId}
                  name={person.name}
                  profilePath={person.profilePath}
                  detail={knownForLine(person.knownForDepartment, person.knownFor)}
                  favoriteAction={
                    signedIn && (
                      <FavoriteButton entityType="person" tmdbId={person.tmdbId} initialFavorited={person.favorited} compact />
                    )
                  }
                />
              </div>
            ))}
          </Shelf>
        );

  const companiesShelf = data.companies.items.length > 0 && (
          <Shelf
            id="search-company"
            title={t(SECTION_TITLES.company)}
            count={count(data.companies.totalResults)}
            seeAllHref={
              data.companies.totalResults > data.companies.items.length ? seeAllHref(query, "company") : undefined
            }
            seeAllText
            gap="tile"
          >
            {data.companies.items.map((company) => (
              <LogoCard
                key={`${company.kind}-${company.tmdbId}`}
                href={companyHref(company)}
                name={company.name}
                logoPath={company.logoPath}
                caption={company.kind === "network" ? t("discover.searchNetwork") : t("discover.searchStudio")}
                favoriteAction={
                  signedIn &&
                  company.kind === "studio" && (
                    <FavoriteButton entityType="company" tmdbId={company.tmdbId} initialFavorited={company.favorited} compact />
                  )
                }
              />
            ))}
          </Shelf>
        );

  // In data.order: Movies, TV Shows, People, Studios & Networks (People
  // first when the query names a person), the theme first or last.
  const blocks: Record<SearchBlock, React.ReactNode> = {
    theme: themeShelf,
    movies: titleShelf("movie", data.movies),
    series: titleShelf("tv", data.series),
    people: peopleShelf,
    companies: companiesShelf,
  };

  return (
    <div className="rail-bleed relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10 h-96"
        style={{
          background: "radial-gradient(120% 60% at 50% -10%, rgba(224,166,62,0.14) 0%, rgba(10,10,12,0) 60%)",
        }}
      />
      <div className="flex flex-col gap-10 py-6 pl-4 pr-0 sm:py-7 sm:pl-7">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pr-4 sm:pr-7">
          <h1 className="font-display text-2xl text-text-primary sm:text-3xl">{t("discover.searchResultsFor", { query })}</h1>
          {signedIn && data.hasResults && <StatusLegend />}
        </div>

        {!data.hasResults && (
          <div className="mx-auto max-w-md py-16 pr-4 text-center sm:pr-7">
            <p className="font-display text-xl text-text-primary">{t("discover.noResults", { query })}</p>
            <p className="mt-2 text-sm text-text-muted">{t("discover.noResultsHint")}</p>
          </div>
        )}

        {data.order.map((block) => <Fragment key={block}>{blocks[block]}</Fragment>)}
      </div>
    </div>
  );
}

/** One section's See all: its whole list as a grid, first page
 * server-rendered and the rest by infinite scroll. */
async function SearchSectionPage({ query, kind }: { query: string; kind: SearchSectionKind }) {
  const t = await getT();
  const viewer = await getViewerContext();
  const signedIn = Boolean(viewer.session);
  const first = await loadSearchSection(viewer, query, kind, 1);
  const hasNextPage = first.page < first.totalPages;

  return (
    <div className="flex flex-col gap-8 px-4 py-6 sm:px-7 sm:py-7">
      <div className="flex flex-col gap-1">
        <Link
          href={`/search?q=${encodeURIComponent(query)}`}
          className="text-xs text-text-muted transition-colors hover:text-accent"
        >
          {t("discover.searchBackToAll", { query })}
        </Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="font-display text-2xl text-text-primary sm:text-3xl">
            {t("discover.searchSectionFor", { section: t(SECTION_TITLES[kind]), query })}
          </h1>
          <span className="text-sm tabular-nums text-text-muted">{formatNumber(t, first.totalResults)}</span>
          {signedIn && (kind === "movie" || kind === "tv") && <StatusLegend />}
        </div>
      </div>

      {first.kind === "movie" || first.kind === "tv" ? (
        <InfiniteResultsGrid
          key={`${first.kind}-${query}`}
          initialItems={first.items}
          initialHasNextPage={hasNextPage}
          search={{ query, type: first.kind }}
          signedIn={signedIn}
          emptyMessage={t("discover.noResults", { query })}
        />
      ) : first.items.length === 0 ? (
        <p className="text-sm text-text-muted">{t("discover.noResults", { query })}</p>
      ) : first.kind === "person" ? (
        <SearchSectionGrid key={`person-${query}`} type="person" query={query} signedIn={signedIn} initialItems={first.items} initialHasNextPage={hasNextPage} />
      ) : (
        <SearchSectionGrid key={`company-${query}`} type="company" query={query} signedIn={signedIn} initialItems={first.items} initialHasNextPage={hasNextPage} />
      )}
    </div>
  );
}
