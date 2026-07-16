import { Suspense } from "react";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { CompanyHeader } from "@/components/company-header";
import { FavoriteButton } from "@/components/favorite-button";
import { MediaList, type MediaEntry } from "@/components/media-list";
import { getOrFetchCompanyWithCatalog } from "@/lib/tmdb/cache";
import { findGroupForCompanyId } from "@/lib/tmdb/company-groups";
import { getLibraryStatusMap } from "@/lib/library/query";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import { isFavorited, getFavoritedTmdbIds } from "@/lib/favorites/query";
import type { titles } from "@/lib/db/schema";

type TitleRow = typeof titles.$inferSelect;

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isFinite(tmdbId)) notFound();

  const group = findGroupForCompanyId(tmdbId);

  let name: string;
  let description: string | null;
  let logoPath: string | null;
  let catalog: TitleRow[];

  if (group) {
    const results = await Promise.all(
      group.memberIds.map((memberId) => getOrFetchCompanyWithCatalog(memberId).catch(() => null)),
    );
    const valid = results.filter((r): r is NonNullable<typeof r> => Boolean(r?.company));
    if (valid.length === 0) notFound();

    const primary = valid.find((r) => r.company.tmdbId === group.memberIds[0]) ?? valid[0];

    name = group.displayName;
    description = primary.company.description;
    logoPath = primary.company.logoPath;

    const seen = new Set<string>();
    catalog = [];
    for (const result of valid) {
      for (const title of result.catalog) {
        const key = `${title.mediaType}:${title.tmdbId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        catalog.push(title);
      }
    }
  } else {
    const solo = await getOrFetchCompanyWithCatalog(tmdbId).catch(() => ({
      company: undefined,
      catalog: [] as TitleRow[],
    }));
    if (!solo.company) notFound();
    name = solo.company.name;
    description = solo.company.description;
    logoPath = solo.company.logoPath;
    catalog = solo.catalog;
  }

  const session = await auth();

  const [statusMap, radarrCredential, sonarrCredential, favorited] = session?.user
    ? await Promise.all([
        getLibraryStatusMap(
          session.user.id,
          catalog.map((title) => ({ mediaType: title.mediaType, tmdbId: title.tmdbId })),
        ),
        getArrCredential(session.user.id, "radarr"),
        getArrCredential(session.user.id, "sonarr"),
        isFavorited(session.user.id, "company", tmdbId),
      ])
    : [new Map(), null, null, false];

  const entries: MediaEntry[] = catalog.map((title) => ({
    titleId: title.id,
    mediaType: title.mediaType,
    tmdbId: title.tmdbId,
    name: title.name,
    posterPath: title.posterPath,
    year: (title.releaseDate || title.firstAirDate || "").slice(0, 4) || null,
    status: statusMap.get(`${title.mediaType}:${title.tmdbId}`),
  }));

  const [favoritedMovieIds, favoritedTvIds] = session?.user
    ? await Promise.all([
        getFavoritedTmdbIds(
          session.user.id,
          "movie",
          entries.filter((e) => e.mediaType === "movie").map((e) => e.tmdbId),
        ),
        getFavoritedTmdbIds(
          session.user.id,
          "tv",
          entries.filter((e) => e.mediaType === "tv").map((e) => e.tmdbId),
        ),
      ])
    : [new Set<number>(), new Set<number>()];
  const favoritedKeys = new Set([
    ...[...favoritedMovieIds].map((id) => `movie:${id}`),
    ...[...favoritedTvIds].map((id) => `tv:${id}`),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <CompanyHeader
        name={name}
        description={description}
        logoPath={logoPath}
        count={catalog.length}
        favoriteAction={
          session?.user && (
            <FavoriteButton entityType="company" tmdbId={tmdbId} initialFavorited={favorited as boolean} />
          )
        }
      />

      <div className="mt-12">
        <Suspense>
          <MediaList
            entries={entries}
            itemLabel="titles"
            showSearch
            showTypeFilter
            arrConfigured={{
              movie: isArrFullyConfigured(radarrCredential),
              tv: isArrFullyConfigured(sonarrCredential),
            }}
            emptyMessage="No titles found for this studio yet."
            favoritedKeys={favoritedKeys}
            showFavorite={Boolean(session?.user)}
          />
        </Suspense>
      </div>
    </div>
  );
}
