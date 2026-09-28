import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CompanyHeader } from "@/components/company-header";
import { EntityHero } from "@/components/entity-hero";
import { FavoriteButton } from "@/components/favorite-button";
import { MediaList } from "@/components/media-list";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { loadCompanyPage } from "@/lib/pages/entities";
import { getT } from "@/lib/i18n/server";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isFinite(tmdbId)) notFound();

  const viewer = await getViewerContext();
  const t = await getT();
  // Shared with GET /api/v1/companies/[id].
  const data = await loadCompanyPage(viewer, tmdbId);
  if (!data) notFound();

  const { company, knownFor, links, entries, favorited, favoritedKeys, arrConfigured } = data;

  return (
    <div className="pb-6 sm:pb-7">
      <EntityHero knownFor={knownFor}>
        <CompanyHeader
          name={company.name}
          description={company.description}
          logoPath={company.logoPath}
          count={company.count}
          links={links}
          favoriteAction={
            viewer.session && (
              <FavoriteButton entityType="company" tmdbId={tmdbId} initialFavorited={favorited} />
            )
          }
        />
      </EntityHero>

      <div className="mt-12 px-4 sm:px-7">
        <Suspense>
          <MediaList
            entries={entries}
            itemLabel="titles"
            showSearch
            showTypeFilter
            arrConfigured={arrConfigured}
            emptyMessage={t("discover.emptyStudio")}
            favoritedKeys={favoritedKeys}
            showFavorite={Boolean(viewer.session)}
          />
        </Suspense>
      </div>
    </div>
  );
}
