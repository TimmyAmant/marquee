"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { PersonTile, knownForLine } from "@/components/person-tile";
import { LogoCard } from "@/components/logo-card";
import { FavoriteButton } from "@/components/favorite-button";
import { loadMoreSearchSection } from "@/app/search/actions";
import type { SearchCompanyCard, SearchPersonCard } from "@/lib/pages/search";
import { useT } from "@/lib/i18n/client";
import { companyHref } from "@/lib/search/links";

/** The grid search's People section uses, on the results page and its See all. */
export const PEOPLE_GRID_CLASS = "grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8";

/** The grid search's Studios & Networks section uses. */
export const LOGO_GRID_CLASS = "grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

export function PeopleGridItems({ people, signedIn }: { people: SearchPersonCard[]; signedIn: boolean }) {
  return people.map((person) => (
    <PersonTile
      key={person.tmdbId}
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
  ));
}

export function CompanyGridItems({ companies, signedIn }: { companies: SearchCompanyCard[]; signedIn: boolean }) {
  const t = useT();
  return companies.map((company) => (
    <LogoCard
      key={`${company.kind}-${company.tmdbId}`}
      href={companyHref(company)}
      name={company.name}
      logoPath={company.logoPath}
      fluid
      caption={company.kind === "network" ? t("discover.searchNetwork") : t("discover.searchStudio")}
      favoriteAction={
        signedIn &&
        company.kind === "studio" && (
          <FavoriteButton entityType="company" tmdbId={company.tmdbId} initialFavorited={company.favorited} compact />
        )
      }
    />
  ));
}

/**
 * A People or Studios & Networks See all (/search?q=&type=person|company):
 * the first page server-rendered, the rest by infinite scroll through
 * loadMoreSearchSection — the same pattern as InfiniteResultsGrid.
 */
export function SearchSectionGrid(
  props: { query: string; signedIn: boolean; initialHasNextPage: boolean } & (
    | { type: "person"; initialItems: SearchPersonCard[] }
    | { type: "company"; initialItems: SearchCompanyCard[] }
  ),
) {
  const t = useT();
  const { query, type, signedIn } = props;
  const [people, setPeople] = useState(props.type === "person" ? props.initialItems : []);
  const [companies, setCompanies] = useState(props.type === "company" ? props.initialItems : []);
  const [hasNextPage, setHasNextPage] = useState(props.initialHasNextPage);
  const [isPending, startTransition] = useTransition();
  const nextPageRef = useRef(2);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || isPending) return;
        const page = nextPageRef.current;
        startTransition(async () => {
          const { section, hasNextPage: more } = await loadMoreSearchSection(query, type, page);
          if (section?.kind === "person") {
            setPeople((prev) => {
              const seen = new Set(prev.map((p) => p.tmdbId));
              return [...prev, ...section.items.filter((p) => !seen.has(p.tmdbId))];
            });
          } else if (section?.kind === "company") {
            setCompanies((prev) => {
              const seen = new Set(prev.map((c) => `${c.kind}:${c.tmdbId}`));
              return [...prev, ...section.items.filter((c) => !seen.has(`${c.kind}:${c.tmdbId}`))];
            });
          }
          setHasNextPage(more);
          nextPageRef.current = page + 1;
        });
      },
      { rootMargin: "1200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isPending, query, type]);

  return (
    <div>
      {type === "person" ? (
        <div className={PEOPLE_GRID_CLASS}>
          <PeopleGridItems people={people} signedIn={signedIn} />
        </div>
      ) : (
        <div className={LOGO_GRID_CLASS}>
          <CompanyGridItems companies={companies} signedIn={signedIn} />
        </div>
      )}
      {hasNextPage && (
        <div ref={sentinelRef} className="mt-10 flex h-10 items-center justify-center">
          {isPending && <span className="text-sm text-text-muted">{t("discover.loadingMore")}</span>}
        </div>
      )}
    </div>
  );
}
