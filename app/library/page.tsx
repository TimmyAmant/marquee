import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { syncPlexLibraryIfStale } from "@/lib/plex/sync";
import { syncJellyfinLibraryIfStale } from "@/lib/jellyfin/sync";
import { syncArrLibraryIfStale } from "@/lib/arr/sync";
import { parseLibraryQuery, libraryQueryParams, type RawLibraryQuery } from "@/lib/library/list";
import { libraryEntry } from "@/lib/api/routes/library";
import { statusKey } from "@/lib/api/mappers";
import {
  loadLibraryCollections,
  loadLibraryConnections,
  loadLibraryDuplicates,
  loadLibraryPage,
  loadLibraryStorage,
} from "@/lib/pages/library";
import { formatBytes } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { LibraryTabs, type LibraryTab } from "@/components/library/library-tabs";
import { LibraryFilters } from "@/components/library/library-filters";
import { LibraryResults } from "@/components/library/library-results";
import { LibraryStorageCard } from "@/components/library/library-storage-card";
import { LibraryDuplicates } from "@/components/library/library-duplicates";
import { FranchiseRow } from "@/components/franchise-row";
import { rich } from "@/lib/i18n/rich";

export type LibrarySearchParams = RawLibraryQuery & { tab?: string; view?: string };

const TABS: LibraryTab[] = ["all", "collections", "duplicates", "storage"];

/**
 * Everything the household owns, in one place: what Plex, Jellyfin, Sonarr
 * and Radarr have, with filters, sort and a grid or table; the franchises
 * it has part of; the admin's duplicates; and the disks. Shared with
 * GET /api/v1/library and its siblings through lib/pages/library.ts.
 */
export default async function LibraryPage({ searchParams }: { searchParams: Promise<LibrarySearchParams> }) {
  const viewer = await getViewerContext();
  if (!viewer.session) redirect("/login");
  const t = await getT();

  const sp = await searchParams;
  const requestedTab = TABS.includes(sp.tab as LibraryTab) ? (sp.tab as LibraryTab) : "all";
  const tab: LibraryTab = requestedTab === "duplicates" && !viewer.isAdmin ? "all" : requestedTab;
  const { query } = parseLibraryQuery(sp);

  const connections = await loadLibraryConnections(viewer.libraryOwnerId);
  if (!connections.any) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h1 className="font-display text-3xl text-text-primary">{t("library.title")}</h1>
        <p className="mt-3 text-text-secondary">
          {viewer.libraryOwnerId === viewer.userId ? t("library.connectAdmin") : t("library.connectMember")}
        </p>
        {viewer.libraryOwnerId === viewer.userId && (
          <Link
            href="/settings/integrations"
            className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover"
          >
            {t("discover.connectIntegration")}
          </Link>
        )}
      </div>
    );
  }

  // A stale library is refreshed on the way in, as every library-backed
  // page does; a sync that fails leaves what was cached.
  await Promise.all([
    syncPlexLibraryIfStale(viewer.libraryOwnerId).catch(() => undefined),
    syncJellyfinLibraryIfStale(viewer.libraryOwnerId).catch(() => undefined),
    syncArrLibraryIfStale(viewer.libraryOwnerId).catch(() => undefined),
  ]);

  return (
    <div className="px-4 py-6 sm:px-7 sm:py-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-3xl text-text-primary">{t("library.title")}</h1>
        <LibraryTabs current={tab} showDuplicates={viewer.isAdmin} query={sp} />
      </div>

      {tab === "all" && <AllTab viewer={viewer} query={query} view={sp.view === "table" ? "table" : "grid"} />}
      {tab === "collections" && <CollectionsTab viewer={viewer} />}
      {tab === "duplicates" && viewer.isAdmin && <DuplicatesTab viewer={viewer} />}
      {tab === "storage" && <StorageTab viewer={viewer} />}
    </div>
  );
}

type SignedIn = Extract<Awaited<ReturnType<typeof getViewerContext>>, { session: object }>;

async function AllTab({
  viewer,
  query,
  view,
}: {
  viewer: SignedIn;
  query: ReturnType<typeof parseLibraryQuery>["query"];
  view: "grid" | "table";
}) {
  const t = await getT();
  const data = await loadLibraryPage(viewer, query);
  const entries = data.page.results.map((item) =>
    libraryEntry(item, { favorited: data.favoritedKeys.has(statusKey(item.mediaType, item.tmdbId)), isAdmin: viewer.isAdmin }),
  );
  const { summary } = data;
  const hasAnything = data.page.totalResults > 0 || libraryQueryParams(query).toString() !== "";

  return (
    <>
      <div className="mt-6 rounded-2xl border border-border bg-bg-1 px-6 py-4">
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <Count value={summary.movieCount} label={t("library.countMovies", { count: summary.movieCount })} />
          <Count value={summary.tvCount} label={t("library.countSeries", { count: summary.tvCount })} />
          {summary.episodeCount > 0 && (
            <Count value={summary.episodeCount} label={t("library.countEpisodes", { count: summary.episodeCount })} />
          )}
          {summary.totalBytes > 0 && <Count value={formatBytes(t, summary.totalBytes)} label={t("library.onDisk")} />}
        </div>
        {summary.trackedCount > 0 && (
          <p className="mt-2 text-xs text-text-muted">{t("library.trackedNote", { count: summary.trackedCount })}</p>
        )}
      </div>

      {!hasAnything ? (
        <p className="mt-8 text-sm text-text-muted">
          {viewer.isAdmin
            ? rich(t("library.stillSyncingAdmin"), {
                link: (chunks) => (
                  <Link href="/settings/integrations" className="text-accent hover:text-accent-hover">
                    {chunks}
                  </Link>
                ),
              })
            : t("library.stillSyncing")}
        </p>
      ) : (
        <>
          <div className="mt-6">
            <LibraryFilters query={query} options={data.filters} view={view} />
          </div>
          <div className="mt-5">
            <LibraryResults
              key={`${libraryQueryParams(query).toString()}|${view}`}
              initialEntries={entries}
              initialPage={data.page.page}
              totalPages={data.page.totalPages}
              totalResults={data.page.totalResults}
              query={query}
              view={view}
              isAdmin={viewer.isAdmin}
            />
          </div>
        </>
      )}
    </>
  );
}

function Count({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <span className="font-display text-2xl text-text-primary">{typeof value === "number" ? value.toLocaleString() : value}</span>
      <span className="ml-1.5 text-text-muted">{label}</span>
    </div>
  );
}

async function CollectionsTab({ viewer }: { viewer: SignedIn }) {
  const t = await getT();
  const data = await loadLibraryCollections(viewer);
  const mayRequest = { movie: data.permissions.requestMovies, tv: data.permissions.requestTv };

  if (data.collections.length === 0) {
    return <p className="mt-8 text-sm text-text-muted">{t("library.collectionsEmpty")}</p>;
  }
  return (
    <div className="mt-8 flex flex-col gap-10">
      {data.collections.map((collection) => (
        <FranchiseRow
          key={collection.key}
          title={`${collection.title} · ${t("library.missingCount", { count: collection.missing.length })}`}
          items={collection.items}
          statusMap={collection.statusMap}
          requestStatusMap={collection.requestStatusMap}
          blockedKeys={data.blockedKeys}
          favoritedIds={collection.favoritedIds}
          showFavorite
          arrConfigured={data.connections.arrConfigured}
          collectionId={collection.collectionId}
          collectionFavorited={collection.collectionFavorited}
          isAdmin={viewer.isAdmin}
          pageTitle={{ mediaType: collection.items[0]?.mediaType ?? "movie", tmdbId: collection.ownedTmdbId }}
          mayRequest={mayRequest}
        />
      ))}
    </div>
  );
}

async function DuplicatesTab({ viewer }: { viewer: SignedIn }) {
  const groups = await loadLibraryDuplicates(viewer);
  return (
    <div className="mt-8">
      <LibraryDuplicates groups={groups} />
    </div>
  );
}

async function StorageTab({ viewer }: { viewer: SignedIn }) {
  const [overview, connections] = await Promise.all([loadLibraryStorage(viewer), loadLibraryConnections(viewer.libraryOwnerId)]);
  return (
    <div className="mt-8 max-w-3xl">
      <LibraryStorageCard
        overview={{ ...overview, measuredAt: overview.measuredAt?.toISOString() ?? null }}
        hasArr={connections.sonarr || connections.radarr}
        isAdmin={viewer.isAdmin}
      />
    </div>
  );
}
