import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CompanyHeader } from "@/components/company-header";
import { EntityHero } from "@/components/entity-hero";
import { MediaList } from "@/components/media-list";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { loadNetworkPage } from "@/lib/pages/entities";
import { getT } from "@/lib/i18n/server";

/** A TV network: a studio's page (app/company/[id]) for its series. */
export default async function NetworkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isFinite(tmdbId)) notFound();

  const viewer = await getViewerContext();
  const t = await getT();
  // Shared with GET /api/v1/networks/[id].
  const data = await loadNetworkPage(viewer, tmdbId);
  if (!data) notFound();

  const { network, knownFor, links, entries, favoritedKeys, arrConfigured } = data;

  return (
    <div className="pb-6 sm:pb-7">
      <EntityHero knownFor={knownFor}>
        <CompanyHeader
          name={network.name}
          description={null}
          logoPath={network.logoPath}
          count={network.count}
          links={links}
        />
      </EntityHero>

      <div className="mt-12 px-4 sm:px-7">
        <Suspense>
          <MediaList
            entries={entries}
            itemLabel="titles"
            showSearch
            arrConfigured={arrConfigured}
            emptyMessage={t("discover.emptyNetwork")}
            favoritedKeys={favoritedKeys}
            showFavorite={Boolean(viewer.session)}
          />
        </Suspense>
      </div>
    </div>
  );
}
