import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CompanyHeader } from "@/components/company-header";
import { FavoriteButton } from "@/components/favorite-button";
import { MediaList } from "@/components/media-list";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { loadCompanyPage } from "@/lib/pages/entities";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isFinite(tmdbId)) notFound();

  const viewer = await getViewerContext();
  // Shared with GET /api/v1/companies/[id].
  const data = await loadCompanyPage(viewer, tmdbId);
  if (!data) notFound();

  const { company, entries, favorited, favoritedKeys, arrConfigured } = data;

  return (
    <div className="px-4 py-6 sm:pl-7 sm:pr-7 sm:py-7">
      <CompanyHeader
        name={company.name}
        description={company.description}
        logoPath={company.logoPath}
        count={company.count}
        favoriteAction={
          viewer.session && (
            <FavoriteButton entityType="company" tmdbId={tmdbId} initialFavorited={favorited} />
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
            arrConfigured={arrConfigured}
            emptyMessage="No titles found for this studio yet."
            favoritedKeys={favoritedKeys}
            showFavorite={Boolean(viewer.session)}
          />
        </Suspense>
      </div>
    </div>
  );
}
