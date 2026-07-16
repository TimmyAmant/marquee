import { Suspense } from "react";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { PersonHeader } from "@/components/person-header";
import { FavoriteButton } from "@/components/favorite-button";
import { MediaList, type MediaEntry } from "@/components/media-list";
import { getOrFetchPersonWithCredits } from "@/lib/tmdb/cache";
import { getLibraryStatusMap } from "@/lib/library/query";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import { isFavorited } from "@/lib/favorites/query";

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isFinite(tmdbId)) notFound();

  const { person, filmography } = await getOrFetchPersonWithCredits(tmdbId).catch(() => ({
    person: undefined,
    filmography: [],
  }));

  if (!person) notFound();

  const session = await auth();

  const [statusMap, radarrCredential, sonarrCredential, favorited] = session?.user
    ? await Promise.all([
        getLibraryStatusMap(
          session.user.id,
          filmography.map(({ title }) => ({ mediaType: title.mediaType, tmdbId: title.tmdbId })),
        ),
        getArrCredential(session.user.id, "radarr"),
        getArrCredential(session.user.id, "sonarr"),
        isFavorited(session.user.id, "person", tmdbId),
      ])
    : [new Map(), null, null, false];

  const entries: MediaEntry[] = filmography.map(({ credit, title }) => ({
    titleId: title.id,
    mediaType: title.mediaType,
    tmdbId: title.tmdbId,
    name: title.name,
    posterPath: title.posterPath,
    year: (title.releaseDate || title.firstAirDate || "").slice(0, 4) || null,
    subtitle: credit.characterName,
    status: statusMap.get(`${title.mediaType}:${title.tmdbId}`),
  }));

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <PersonHeader
        name={person.name}
        biography={person.biography}
        birthday={person.birthday}
        placeOfBirth={person.placeOfBirth}
        profilePath={person.profilePath}
        favoriteAction={
          session?.user && (
            <FavoriteButton entityType="person" tmdbId={tmdbId} initialFavorited={favorited as boolean} />
          )
        }
      />

      <div className="mt-12">
        <Suspense>
          <MediaList
            entries={entries}
            subtitleLabel="Role"
            itemLabel="credits"
            showSearch
            showTypeFilter
            arrConfigured={{
              movie: isArrFullyConfigured(radarrCredential),
              tv: isArrFullyConfigured(sonarrCredential),
            }}
            emptyMessage="No processed filmography found for this person yet."
          />
        </Suspense>
      </div>
    </div>
  );
}
