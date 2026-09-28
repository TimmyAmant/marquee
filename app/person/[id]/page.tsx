import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PersonHeader } from "@/components/person-header";
import { EntityHero } from "@/components/entity-hero";
import { FavoriteButton } from "@/components/favorite-button";
import { MediaList } from "@/components/media-list";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { loadPersonPage } from "@/lib/pages/entities";
import { ShareButton } from "@/components/share-button";
import { getPublicBaseUrl } from "@/lib/sharing";
import { getT } from "@/lib/i18n/server";

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isFinite(tmdbId)) notFound();

  const viewer = await getViewerContext();
  const t = await getT();
  // Shared with GET /api/v1/people/[id].
  const [data, publicBase] = await Promise.all([
    loadPersonPage(viewer, tmdbId),
    viewer.session ? getPublicBaseUrl().catch(() => null) : null,
  ]);
  if (!data) notFound();

  const { person, knownFor, links, entries, favorited, favoritedKeys, arrConfigured } = data;

  return (
    <div className="pb-6 sm:pb-7">
      <EntityHero knownFor={knownFor}>
        <PersonHeader
          name={person.name}
          biography={person.biography}
          birthday={person.birthday}
          placeOfBirth={person.placeOfBirth}
          profilePath={person.profilePath}
          links={links}
          favoriteAction={
            viewer.session && (
              <>
                <FavoriteButton entityType="person" tmdbId={tmdbId} initialFavorited={favorited} />
                {/* Links only: a person can't be sent to a household member. */}
                <ShareButton
                  name={person.name}
                  path={`/person/${tmdbId}`}
                  publicBase={publicBase}
                  links={{
                    tmdb: `https://www.themoviedb.org/person/${tmdbId}`,
                    imdb: links.find((link) => link.kind === "imdb")?.url ?? null,
                  }}
                />
              </>
            )
          }
        />
      </EntityHero>

      <div className="mt-12 px-4 sm:px-7">
        <Suspense>
          <MediaList
            entries={entries}
            subtitleLabel={t("discover.columnRole")}
            itemLabel="credits"
            showSearch
            showTypeFilter
            arrConfigured={arrConfigured}
            emptyMessage={t("discover.emptyPerson")}
            favoritedKeys={favoritedKeys}
            showFavorite={Boolean(viewer.session)}
          />
        </Suspense>
      </div>
    </div>
  );
}
