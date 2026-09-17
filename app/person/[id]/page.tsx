import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PersonHeader } from "@/components/person-header";
import { FavoriteButton } from "@/components/favorite-button";
import { MediaList } from "@/components/media-list";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { loadPersonPage } from "@/lib/pages/entities";

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
  const data = await loadPersonPage(viewer, tmdbId);
  if (!data) notFound();

  const { person, entries, favorited, favoritedKeys, arrConfigured } = data;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <PersonHeader
        name={person.name}
        biography={person.biography}
        birthday={person.birthday}
        placeOfBirth={person.placeOfBirth}
        profilePath={person.profilePath}
        favoriteAction={
          viewer.session && (
            <FavoriteButton entityType="person" tmdbId={tmdbId} initialFavorited={favorited} />
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
