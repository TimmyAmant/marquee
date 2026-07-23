import Image from "next/image";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import type { LibraryStatus } from "@/components/status-badge";
import { AddToLibraryButton } from "@/components/add-to-library-button";
import { ExternalLinks, type ExternalLinksData } from "@/components/external-links";
import { FavoriteButton } from "@/components/favorite-button";
import { RelinkTitleForm } from "@/components/relink-title-form";
import { ArrTrackingControls } from "@/components/arr-tracking-controls";
import { FileDetailsSection } from "@/components/file-details-section";
import type { ArrTrackingInfo, FileInfo } from "@/lib/integrations/status";
import type { CreditEntry } from "@/lib/title-meta";

export type TitleMeta = {
  runtimeLabel: string | null;
  /** TMDb's vote_average (0-10) converted to a percentage, matching how
   * Sonarr/other *arr apps display their own rating. */
  ratingPercent: number | null;
  genres: string[];
  /** "2001–2011" for an ended show, "2026" for a movie or an ongoing show
   * with no end year yet. */
  yearRange: string | null;
  statusLabel: string | null;
  network: string | null;
};

export type TitleSidebarData = {
  releaseDateLabel: string | null;
  nextAirDateLabel: string | null;
  originalLanguageLabel: string | null;
  productionCountry: { name: string; flag: string } | null;
  watchProviders: { name: string; logoPath: string | null }[];
};

function SidebarRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0">
      <span className="text-text-muted">{label}</span>
      <span className="text-right text-text-primary">{value}</span>
    </div>
  );
}

export function TitleHero({
  mediaType,
  tmdbId,
  name,
  overview,
  tagline,
  posterPath,
  backdropPath,
  meta,
  sidebar,
  credits,
  keywords,
  status,
  configured,
  links,
  favorited,
  isAdmin,
  alreadyRequested,
  otherRequesters,
  tvdbId,
  arrTracking,
  file,
  runtimeLabel,
}: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  name: string;
  overview: string | null;
  tagline?: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  meta: TitleMeta;
  sidebar: TitleSidebarData;
  credits: CreditEntry[];
  keywords: string[];
  status: LibraryStatus;
  configured: boolean;
  links: ExternalLinksData;
  /** Omitted entirely (no button shown) when signed out. */
  favorited?: boolean;
  isAdmin?: boolean;
  alreadyRequested?: boolean;
  otherRequesters?: string[];
  tvdbId?: number | null;
  arrTracking?: ArrTrackingInfo | null;
  /** Renders a "File details" card in the sidebar below the rating/status
   * card — null when the title isn't in the library, same as the standalone
   * section this replaced. */
  file?: FileInfo | null;
  runtimeLabel?: string | null;
}) {
  // Rating/status/network live in the sidebar instead — this line is just
  // the quick facts, matching the reference layout's short line under the
  // title (runtime | genres | year), not a catch-all for every field.
  const metaParts = [meta.runtimeLabel, meta.genres.length > 0 ? meta.genres.join(", ") : null, meta.yearRange].filter(
    (v): v is string => Boolean(v),
  );
  const backdrop = tmdbImageUrl(backdropPath, "original");
  const poster = tmdbImageUrl(posterPath, "w500");

  return (
    <div className="relative">
      {backdrop && (
        <div className="grain-overlay absolute inset-0 -z-10 h-[380px] overflow-hidden">
          <Image src={backdrop} alt="" fill priority className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg-0 via-bg-0/10 to-transparent" />
        </div>
      )}

      {/* Backdrop zone — poster + title only, per design: artwork should never
          carry metadata text (runtime/genres/year/status), just the name. */}
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 pt-[220px] sm:flex-row sm:items-start">
        <div className="relative aspect-[2/3] w-56 shrink-0 overflow-hidden rounded-xl bg-bg-2 shadow-2xl ring-1 ring-border-strong">
          {poster && <Image src={poster} alt={name} fill sizes="224px" className="object-cover" />}
        </div>

        {/* Independent of the poster's height — top-aligned with a fixed
            offset that lands the title right where the backdrop's gradient
            has already faded to solid background, not bottom-aligned to
            the (much taller) poster, which pushed it far down into the
            plain background below. */}
        <h1 className="font-display text-4xl text-text-primary sm:mt-40 sm:text-5xl">{name}</h1>
      </div>

      {/* Below the backdrop, on the page's plain background — left-padded on
          sm+ to align under the title rather than the poster beside it. */}
      <div className="mx-auto max-w-6xl px-6 pb-4 pt-5 sm:pl-64">
        <div className="flex flex-wrap items-center gap-3">
          {metaParts.length > 0 && (
            <p className="text-text-secondary">{metaParts.join(" · ")}</p>
          )}
          {favorited !== undefined && (
            <FavoriteButton entityType={mediaType} tmdbId={tmdbId} initialFavorited={favorited} />
          )}
        </div>

        <div className="mt-4">
          <AddToLibraryButton
            mediaType={mediaType}
            tmdbId={tmdbId}
            name={name}
            posterPath={posterPath}
            status={status}
            configured={configured}
            isAdmin={isAdmin}
            alreadyRequested={alreadyRequested}
            otherRequesters={otherRequesters}
          />
        </div>

        <div className="mt-8 flex flex-col gap-8 lg:flex-row">
          <div className="min-w-0 flex-1">
            {tagline && <p className="italic text-text-secondary">{tagline}</p>}

            {overview && (
              <>
                <h2 className="mt-5 font-display text-lg text-text-primary">Overview</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">{overview}</p>
              </>
            )}

            {credits.length > 0 && (
              <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
                {credits.map((credit, i) => (
                  <div key={i}>
                    <p className="text-sm font-semibold text-text-primary">{credit.role}</p>
                    <p className="text-sm text-text-secondary">{credit.name}</p>
                  </div>
                ))}
              </div>
            )}

            {keywords.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-full border border-border px-3 py-1 text-xs text-text-secondary"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-6">
              <ExternalLinks links={links} />
            </div>

            {isAdmin && arrTracking && (
              <div className="mt-4">
                <ArrTrackingControls
                  mediaType={mediaType}
                  tmdbId={tmdbId}
                  tvdbId={tvdbId ?? null}
                  monitored={arrTracking.monitored}
                />
              </div>
            )}

            {isAdmin && status !== "untracked" && (
              <div className="mt-4">
                <RelinkTitleForm mediaType={mediaType} tmdbId={tmdbId} />
              </div>
            )}
          </div>

          <aside className="w-full shrink-0 lg:w-72">
            <div className="rounded-2xl border border-border bg-bg-1 p-5 text-sm">
              {meta.ratingPercent !== null && (
                <div className="flex items-center gap-1.5 border-b border-border pb-2.5 text-accent">
                  <span>★</span>
                  <span className="font-medium">{meta.ratingPercent}%</span>
                </div>
              )}
              <SidebarRow label="Status" value={meta.statusLabel} />
              <SidebarRow
                label={mediaType === "movie" ? "Release Date" : "First Air Date"}
                value={sidebar.releaseDateLabel}
              />
              <SidebarRow label="Next Air Date" value={sidebar.nextAirDateLabel} />
              <SidebarRow label="Original Language" value={sidebar.originalLanguageLabel} />
              <SidebarRow
                label="Production Country"
                value={sidebar.productionCountry ? `${sidebar.productionCountry.flag} ${sidebar.productionCountry.name}` : null}
              />
              <SidebarRow label="Network" value={meta.network} />

              {sidebar.watchProviders.length > 0 && (
                <div className="border-t border-border pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Currently Streaming On
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {sidebar.watchProviders.map((provider) => {
                      const logo = tmdbImageUrl(provider.logoPath, "w92");
                      return (
                        <div
                          key={provider.name}
                          title={provider.name}
                          className="h-8 w-8 shrink-0 overflow-hidden rounded-md bg-white"
                        >
                          {logo && (
                            <Image
                              src={logo}
                              alt={provider.name}
                              width={32}
                              height={32}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {file && (
              <div className="mt-6">
                <FileDetailsSection mediaType={mediaType} file={file} runtimeLabel={runtimeLabel ?? null} />
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
