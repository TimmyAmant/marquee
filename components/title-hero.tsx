import Image from "next/image";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import type { LibraryStatus } from "@/components/status-badge";
import { AddToLibraryButton } from "@/components/add-to-library-button";
import { ExternalLinks, type ExternalLinksData } from "@/components/external-links";
import { FavoriteButton } from "@/components/favorite-button";
import { RelinkTitleForm } from "@/components/relink-title-form";
import { ArrTrackingControls } from "@/components/arr-tracking-controls";
import { FileDetailsSection } from "@/components/file-details-section";
import { CapsLabel } from "@/components/caps-label";
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

/** A 38px fact row in the right rail's facts card — label left, value right,
 * hairline rule above, all per Docs/DESIGN_TARGET.md. */
function SidebarRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex min-h-[38px] items-center justify-between gap-2.5 border-t border-border py-1.5 text-[12.5px]">
      <span className="text-text-secondary">{label}</span>
      <span className="text-right font-medium text-text-primary">{value}</span>
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
  cast,
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
  /** The cast carousel, rendered inside the main column so it sits beside
   * the right rail's lower half exactly as the mockup has it, instead of
   * being pushed below the (much taller) rail. */
  cast?: React.ReactNode;
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
    // -mt-[52px] lifts the page under the floating top bar: in the mockup
    // .backdrop sits at top:0 of the content area with the toolbar over it,
    // so the poster's 170 and the title/rail's 246 are all from the window
    // top (Docs/DESIGN_TARGET.md).
    <div className="relative -mt-[52px]">
      {backdrop && (
        <div className="grain-overlay absolute inset-x-0 top-0 -z-10 h-[300px] overflow-hidden sm:h-[380px]">
          <Image src={backdrop} alt="" fill priority className="object-cover" />
          {/* Two gradients, same as the mockup's .backdrop .fade: down to the
              page background at the bottom, plus a left-hand scrim so the
              poster and title always have something dark behind them. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, color-mix(in srgb, var(--marquee-bg-0) 60%, transparent) 0%, transparent 20%, transparent 40%, color-mix(in srgb, var(--marquee-bg-0) 72%, transparent) 74%, var(--marquee-bg-0) 100%), linear-gradient(to right, color-mix(in srgb, var(--marquee-bg-0) 50%, transparent), transparent 42%)",
            }}
          />
        </div>
      )}

      {/* Left-aligned with a fixed 48px gutter rather than centered in a
          max-width container — that's what keeps this page and the Mac app
          on the same coordinates (Docs/DESIGN_TARGET.md). */}
      <div className="px-6 xl:pl-12 xl:pr-10">
        <div className="flex flex-col gap-8 pt-[150px] sm:pt-[170px] xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1 xl:max-w-[802px]">
            <div className="flex flex-wrap gap-6 sm:gap-8 min-[1440px]:flex-nowrap">
              {/* Nothing but the poster and the title sits on the artwork. */}
              <div className="relative h-[240px] w-[160px] shrink-0 overflow-hidden rounded-xl bg-bg-2 shadow-[0_28px_64px_rgba(0,0,0,0.65),0_8px_20px_rgba(0,0,0,0.45)] ring-1 ring-border-strong sm:h-[336px] sm:w-[224px]">
                {poster && <Image src={poster} alt={name} fill sizes="224px" className="object-cover" />}
              </div>

              <div className="min-w-0 flex-1 basis-[280px] xl:pt-[76px] min-[1440px]:w-[546px] min-[1440px]:flex-none min-[1440px]:basis-auto">
                <h1 className="font-display text-[34px] font-bold leading-[40px] tracking-[-0.015em] text-text-primary [text-shadow:0_2px_20px_rgba(0,0,0,0.4)] sm:text-[48px] sm:leading-[54px]">
                  {name}
                </h1>

                <div className="mt-2.5 flex flex-wrap items-center gap-x-[14px] gap-y-2 text-[14px] text-text-secondary">
                  {metaParts.length > 0 && <p>{metaParts.join(" · ")}</p>}
                  {favorited !== undefined && (
                    <FavoriteButton entityType={mediaType} tmdbId={tmdbId} initialFavorited={favorited} />
                  )}
                </div>

                {/* One row of capsules: library badge, then the actions that
                    apply to it (search/monitor/relink), all 32px tall. */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
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

                  {isAdmin && arrTracking && (
                    <ArrTrackingControls
                      mediaType={mediaType}
                      tmdbId={tmdbId}
                      tvdbId={tvdbId ?? null}
                      monitored={arrTracking.monitored}
                    />
                  )}

                  {isAdmin && status !== "untracked" && (
                    <RelinkTitleForm mediaType={mediaType} tmdbId={tmdbId} />
                  )}
                </div>

                {tagline && <p className="mt-[26px] text-[14px] italic text-text-secondary">{tagline}</p>}

                {overview && (
                  <>
                    <h2
                      className={`font-display text-[18px] font-semibold leading-6 text-text-primary ${
                        tagline ? "mt-4" : "mt-[26px]"
                      }`}
                    >
                      Overview
                    </h2>
                    <p className="mt-1.5 text-[14px] leading-[22px] text-text-secondary">{overview}</p>
                  </>
                )}

                {credits.length > 0 && (
                  <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {credits.map((credit, i) => (
                      <div key={i}>
                        <p className="truncate text-[13.5px] font-semibold leading-[18px] text-text-primary">
                          {credit.name}
                        </p>
                        <p className="mt-px truncate text-[12px] leading-4 text-text-muted">{credit.role}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* A single row that never wraps — the overflow is clipped
                    rather than stacked into more rows. */}
                {keywords.length > 0 && (
                  <div className="mt-[18px] flex gap-1.5 overflow-hidden [mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)]">
                    {keywords.map((keyword) => (
                      <span
                        key={keyword}
                        className="inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-[11px] border border-border px-[9px] text-[11px] text-text-secondary"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3.5">
                  <ExternalLinks links={links} />
                </div>
              </div>
            </div>

            {cast && <div className="mt-10">{cast}</div>}
          </div>

          <aside className="w-full shrink-0 xl:w-[288px] xl:pt-[76px]">
            <div className="rounded-2xl border border-border bg-bg-1/95 px-[18px] pb-4 pt-1 shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur-[20px]">
              {meta.ratingPercent !== null && (
                <div className="flex h-[50px] items-center justify-between gap-2.5">
                  <span className="font-display text-[22px] font-bold tracking-[-0.01em] text-accent">
                    ★ {meta.ratingPercent}%
                  </span>
                  <span className="text-[11px] text-text-muted">TMDb user score</span>
                </div>
              )}
              <div className={meta.ratingPercent === null ? "[&>div:first-child]:border-t-0" : ""}>
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
              </div>

              {sidebar.watchProviders.length > 0 && (
                <div className="border-t border-border pt-[14px]">
                  <CapsLabel>Currently Streaming On</CapsLabel>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {sidebar.watchProviders.map((provider) => {
                      const logo = tmdbImageUrl(provider.logoPath, "w92");
                      return (
                        <div
                          key={provider.name}
                          title={provider.name}
                          className="h-9 w-9 shrink-0 overflow-hidden rounded-[9px] bg-white shadow-[0_2px_6px_rgba(0,0,0,0.3)]"
                        >
                          {logo && (
                            <Image
                              src={logo}
                              alt={provider.name}
                              width={36}
                              height={36}
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
              <div className="mt-4">
                <FileDetailsSection mediaType={mediaType} file={file} runtimeLabel={runtimeLabel ?? null} />
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
