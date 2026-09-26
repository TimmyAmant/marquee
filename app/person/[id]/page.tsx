import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PersonHeader } from "@/components/person-header";
import { FavoriteButton } from "@/components/favorite-button";
import { MediaList } from "@/components/media-list";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { loadPersonPage } from "@/lib/pages/entities";
import { ShareButton } from "@/components/share-button";
import { getPublicBaseUrl } from "@/lib/sharing";

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isFinite(tmdbId)) notFound();

  const viewer = await getViewerContext();
  // Shared with GET /api/v1/people/[id].
  const [data, publicBase] = await Promise.all([
    loadPersonPage(viewer, tmdbId),
    viewer.session ? getPublicBaseUrl().catch(() => null) : null,
  ]);
  if (!data) notFound();

  const { person, entries, favorited, favoritedKeys, arrConfigured } = data;

  return (
    <div className="px-4 py-6 sm:pl-7 sm:pr-7 sm:py-7">
      <PersonHeader
        name={person.name}
        biography={person.biography}
        birthday={person.birthday}
        placeOfBirth={person.placeOfBirth}
        profilePath={person.profilePath}
        favoriteAction={
          viewer.session && (
            <>
              <FavoriteButton entityType="person" tmdbId={tmdbId} initialFavorited={favorited} />
              {/* Links only: a person can't be sent to a household member. */}
              <ShareButton
                name={person.name}
                path={`/person/${tmdbId}`}
                publicBase={publicBase}
                links={{ tmdb: `https://www.themoviedb.org/person/${tmdbId}`, imdb: null }}
              />
            </>
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
            arrConfigured={arrConfigured}
            emptyMessage="No processed filmography found for this person yet."
            favoritedKeys={favoritedKeys}
            showFavorite={Boolean(viewer.session)}
          />
        </Suspense>
      </div>
    </div>
  );
}
