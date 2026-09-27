import Link from "next/link";
import Image from "next/image";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import { MediaImage } from "@/components/media-image";
import type { LibraryStatus } from "@/components/status-badge";
import { isUnwanted } from "@/lib/library/status-tone";
import { AddToLibraryButton } from "@/components/add-to-library-button";
import { ExternalLinks, type ExternalLinksData } from "@/components/external-links";
import { FavoriteButton } from "@/components/favorite-button";
import { RelinkTitleForm } from "@/components/relink-title-form";
import { ArrTrackingControls } from "@/components/arr-tracking-controls";
import { FourKControls } from "@/components/fourk-controls";
import { ReportProblemButton } from "@/components/report-problem-button";
import { ShareButton } from "@/components/share-button";
import { publicTitleLinks } from "@/lib/sharing/parse";
import { BlockRequestsButton } from "@/components/block-requests-button";
import type { FourKViewerState, TitleRequestSummary } from "@/lib/api/types";
import { MyTitleRequests } from "@/components/my-title-requests";
import { FileDetailsSection } from "@/components/file-details-section";
import { CapsLabel } from "@/components/caps-label";
import type { ArrTrackingInfo, FileInfo } from "@/lib/integrations/status";
import type { CreditEntry } from "@/lib/title-meta";
import { getT } from "@/lib/i18n/server";
import { formatDate, formatNumber } from "@/lib/i18n/format";
import { hasAnyRating, imdbTitleUrl, type TitleRatings } from "@/lib/ratings/omdb";
import type { PlayLink } from "@/lib/media-servers/play-links";
import { PlayButton } from "@/components/play-button";
import { TitleMoreMenu } from "@/components/title-more-menu";
import { PILL } from "@/components/pill-styles";

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
  /** The country the providers (and a movie's release dates) are for. */
  streamingRegion: string;
  /** TMDb's (JustWatch) "where to watch" page for that country. */
  streamingLink: string | null;
  /** Only when it differs from the name shown. */
  originalTitle: string | null;
  theatricalReleaseLabel: string | null;
  digitalReleaseLabel: string | null;
  budgetLabel: string | null;
  revenueLabel: string | null;
  /** A movie's first studio (a show has its network instead). */
  studio: string | null;
  /** IMDb / Rotten Tomatoes / Metacritic (lib/ratings); null without an
   * OMDb key or when nothing is known. */
  ratings: TitleRatings | null;
  imdbId: string | null;
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

/** IMDb, Rotten Tomatoes and Metacritic (lib/ratings/omdb.ts) under the
 * TMDb score, each a small badge; IMDb's links to the title there. */
async function RatingsRow({ ratings, imdbId }: { ratings: TitleRatings; imdbId: string | null }) {
  const t = await getT();
  const badge = "inline-flex h-[26px] items-center gap-1.5 rounded-full border border-border px-2.5 text-[12px] font-medium text-text-primary";
  const mark = "font-display text-[10px] font-bold tracking-wide";
  const imdb =
    ratings.imdbRating !== null ? (
      <span className={badge} title={t("title.imdbRating")}>
        <span className={`${mark} rounded-[3px] bg-[#f5c518] px-1 text-black`}>IMDb</span>
        {formatNumber(t, ratings.imdbRating, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
        {ratings.imdbVotes !== null && (
          <span className="text-[11px] text-text-muted">
            ({formatNumber(t, ratings.imdbVotes, { notation: "compact", maximumFractionDigits: 1 })})
          </span>
        )}
      </span>
    ) : null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-border py-2.5" data-testid="ratings-row">
      {imdb && imdbId ? (
        <a href={imdbTitleUrl(imdbId)} target="_blank" rel="noreferrer" className="hover:opacity-80">
          {imdb}
        </a>
      ) : (
        imdb
      )}
      {ratings.rottenTomatoesCritics !== null && (
        <span className={badge} title={t("title.rottenTomatoesCritics")}>
          <span aria-hidden>🍅</span>
          {t("title.ratingPercent", { percent: ratings.rottenTomatoesCritics })}
        </span>
      )}
      {ratings.metacritic !== null && (
        <span className={badge} title={t("title.metacriticScore")}>
          {/* i18n-ignore */}
          <span className={`${mark} rounded-[3px] bg-[#66cc33] px-1 text-black`}>MC</span>
          {ratings.metacritic}
        </span>
      )}
    </div>
  );
}

export async function TitleHero({
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
  seasonPicker,
  tvdbId,
  arrTracking,
  fourK,
  report,
  blocked,
  notFoundSince,
  file,
  runtimeLabel,
  logo = null,
  share,
  myRequests = [],
  may,
  playLinks = [],
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
  seasonPicker?: React.ComponentProps<typeof AddToLibraryButton>["seasonPicker"];
  tvdbId?: number | null;
  arrTracking?: ArrTrackingInfo | null;
  /** The 4K row (components/fourk-controls.tsx); null without a 4K instance. */
  fourK?: FourKViewerState | null;
  /** "Report a problem"; null when there's nothing to report (or signed out). */
  report?: { seasonNumbers: number[]; openReports: number } | null;
  /** On the admin's blocklist (lib/requests/blocklist.ts); null otherwise. */
  blocked?: { reason: string | null; keyword: string | null } | null;
  /** Reviewers only: Sonarr/Radarr hasn't found the approved request since
   * then (lib/requests/not-found.ts); links to the Requests page's list. */
  notFoundSince?: string | null;
  /** Renders a "File details" card in the sidebar below the rating/status
   * card — null when the title isn't in the library, same as the standalone
   * section this replaced. */
  file?: FileInfo | null;
  runtimeLabel?: string | null;
  /** TMDb's title-treatment artwork (lib/tmdb/logo.ts), shown in place of
   * the plain-text name in the dark theme; null without one. */
  logo?: { path: string; aspectRatio: number } | null;
  /** "Share" (signed in): Marquee's public address, null when none is set. */
  share?: { publicBase: string | null } | null;
  /** The viewer's own requests for this title: Edit / Cancel and comments. */
  myRequests?: TitleRequestSummary[];
  /** What the viewer may do here (lib/users/permissions.ts); omitted when
   * signed out. */
  may?: { request: boolean; advanced: boolean; manageBlocklist: boolean; autoApprove?: boolean };
  /** "Play on Plex" and friends (lib/media-servers/play-links.ts). */
  playLinks?: PlayLink[];
}) {
  const t = await getT();
  // Rating/status/network live in the sidebar instead — this line is just
  // the quick facts, matching the reference layout's short line under the
  // title (runtime | genres | year), not a catch-all for every field.
  const metaParts = [meta.runtimeLabel, meta.genres.length > 0 ? meta.genres.join(", ") : null, meta.yearRange].filter(
    (v): v is string => Boolean(v),
  );
  const backdrop = tmdbImageUrl(backdropPath, "original");
  // w780 so the 264px poster of a wide window is still sharp at 2x;
  // next/image picks the size the layout actually needs from it.
  const poster = tmdbImageUrl(posterPath, "w780");
  const logoSrc = logo ? tmdbImageUrl(logo.path, "original") : null;
  // Admin-only tools nobody needs every visit: in the "…" menu rather than
  // two more rows of pills. Unblock stays out in the row while the title is
  // blocked, since it's also the only sign on the page that it is.
  const menuBlock = Boolean(may?.manageBlocklist) && !blocked;
  const menuTracking = Boolean(isAdmin && arrTracking);
  const menuRelink = Boolean(isAdmin && !isUnwanted(status));

  return (
    // --hero-h is the artwork's height: a fixed band on a phone, then
    // min(70% of the window's height, 16:9 of its width) — the whole
    // backdrop without letterboxing on a laptop and never more than the
    // first screen on a wide monitor. -mt lifts the page under the floating
    // top bar (72px when the nav rail is a bar along the top), so the art
    // starts at the window's top edge.
    <div className="relative -mt-[52px] [--hero-h:340px] sm:[--hero-h:440px] md:rail-top:-mt-[72px] md:[--hero-h:max(460px,min(70svh,56.25vw))]">
      {backdrop && (
        <div className="grain-overlay rail-under pointer-events-none absolute inset-x-0 top-0 -z-10 h-[var(--hero-h)] overflow-hidden">
          <MediaImage
            src={backdrop}
            alt=""
            fill
            loading="eager"
            fetchPriority="high"
            sizes="100vw"
            quality={85}
            className="object-cover object-[50%_25%]"
          />
          {/* Three fades so the artwork has no edges: a scrim under the top
              bar, a long fall into the page background at the bottom (the
              rows below continue on the same colour), and a wash from the
              left behind the poster and the text. */}
          <div
            className="absolute inset-0"
            style={{
              background: [
                "linear-gradient(to bottom, color-mix(in srgb, var(--marquee-bg-0) 65%, transparent) 0%, color-mix(in srgb, var(--marquee-bg-0) 20%, transparent) 12%, transparent 24%)",
                "linear-gradient(to bottom, transparent 38%, color-mix(in srgb, var(--marquee-bg-0) 45%, transparent) 62%, color-mix(in srgb, var(--marquee-bg-0) 85%, transparent) 82%, var(--marquee-bg-0) 100%)",
                // Strong enough across the whole text column (it reaches
                // ~70% of a laptop's width) that a bright frame never sits
                // behind the overview, then gone well before the right edge.
                "linear-gradient(to right, color-mix(in srgb, var(--marquee-bg-0) 90%, transparent) 0%, color-mix(in srgb, var(--marquee-bg-0) 78%, transparent) 28%, color-mix(in srgb, var(--marquee-bg-0) 52%, transparent) 52%, color-mix(in srgb, var(--marquee-bg-0) 16%, transparent) 72%, transparent 88%)",
              ].join(", "),
            }}
          />
        </div>
      )}

      {/* The same gutters as the rows under the hero (page.tsx), so the
          poster, the Cast row and "More like this" all start on one line and
          the facts card ends where the rows do. Three columns from 1280px:
          poster | the title and everything about it | facts. */}
      <div className="px-6 xl:pl-12 xl:pr-10">
        <div className="grid grid-cols-1 gap-x-8 gap-y-8 pt-[150px] sm:grid-cols-[224px_minmax(0,1fr)] sm:pt-[190px] md:pt-[calc(var(--hero-h)*0.4)] xl:grid-cols-[224px_minmax(0,1fr)_300px] min-[1800px]:grid-cols-[264px_minmax(0,1fr)_340px] min-[1800px]:gap-x-12 min-[2400px]:grid-cols-[300px_minmax(0,1fr)_380px] min-[2400px]:gap-x-16">
          <div className="relative h-[240px] w-[160px] overflow-hidden rounded-xl bg-bg-2 shadow-[0_28px_64px_rgba(0,0,0,0.65),0_8px_20px_rgba(0,0,0,0.45)] ring-1 ring-border-strong sm:h-[336px] sm:w-[224px] min-[1800px]:h-[396px] min-[1800px]:w-[264px] min-[2400px]:h-[450px] min-[2400px]:w-[300px]">
            {poster && (
              <MediaImage
                src={poster}
                alt={name}
                fill
                loading="eager"
                sizes="(min-width: 2400px) 300px, (min-width: 1800px) 264px, (min-width: 640px) 224px, 160px"
                className="object-cover"
              />
            )}
          </div>

          <div className="min-w-0">
            <h1 className="font-display text-[34px] font-bold leading-[40px] tracking-[-0.015em] text-text-primary [text-shadow:0_2px_20px_rgba(0,0,0,0.4)] sm:text-[48px] sm:leading-[54px] min-[1800px]:text-[56px] min-[1800px]:leading-[62px] min-[2400px]:text-[64px] min-[2400px]:leading-[70px]">
              {logoSrc && logo ? (
                <>
                  {/* The logo in the dark theme; its name for screen readers
                      and in the light theme, where a white logo would vanish
                      into the page (globals.css .title-logo). */}
                  <span className="title-logo block">
                    <Image
                      src={logoSrc}
                      alt=""
                      width={500}
                      height={Math.max(1, Math.round(500 / logo.aspectRatio))}
                      sizes="(min-width: 1800px) 520px, (min-width: 640px) 420px, 280px"
                      loading="eager"
                      className="h-auto max-h-[96px] w-auto max-w-[min(100%,280px)] object-contain object-left drop-shadow-[0_2px_18px_rgba(0,0,0,0.5)] sm:max-h-[128px] sm:max-w-[min(100%,420px)] min-[1800px]:max-h-[160px] min-[1800px]:max-w-[520px]"
                    />
                  </span>
                  <span className="title-logo-name">{name}</span>
                </>
              ) : (
                name
              )}
            </h1>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-[14px] gap-y-2 text-[14px] text-text-secondary">
              {metaParts.length > 0 && <p>{metaParts.join(" · ")}</p>}
              {favorited !== undefined && (
                <FavoriteButton entityType={mediaType} tmdbId={tmdbId} initialFavorited={favorited} />
              )}
            </div>

            {/* One row of 32px capsules on a shared centre line: the main
                action first (Play, Add / Request with "Advanced" as its
                chevron), the library badge, the everyday extras, then "…".
                Notes and the Advanced panel wrap to the end of the row. */}
            <div className="mt-5 flex flex-wrap items-center gap-2" data-testid="title-actions">
              {playLinks.length > 0 && <PlayButton links={playLinks} />}

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
                seasonPicker={seasonPicker}
                inArr={Boolean(arrTracking)}
                blocked={blocked ?? null}
                canRequest={may?.request ?? false}
                advanced={may?.advanced ?? false}
                autoApprove={may?.autoApprove ?? false}
              />

              {notFoundSince && (
                <Link
                  href="/requests#cant-find"
                  title={t("title.notFoundSince", { date: formatDate(t, notFoundSince) })}
                  className={`${PILL} border border-missing/40 bg-missing-bg font-medium text-missing hover:bg-missing/20`}
                >
                  {t("title.cantFind")}
                </Link>
              )}

              {fourK && <FourKControls mediaType={mediaType} tmdbId={tmdbId} fourK={fourK} advanced={may?.advanced ?? false} />}

              {report && (
                <ReportProblemButton
                  mediaType={mediaType}
                  tmdbId={tmdbId}
                  seasonNumbers={report.seasonNumbers}
                  openReports={report.openReports}
                />
              )}

              {share && (
                <ShareButton
                  name={name}
                  path={`/title/${mediaType}/${tmdbId}`}
                  publicBase={share.publicBase}
                  links={publicTitleLinks(mediaType, tmdbId, links.imdbId ?? null)}
                  sendTo={{ mediaType, tmdbId }}
                />
              )}

              {may?.manageBlocklist && blocked && (
                <BlockRequestsButton mediaType={mediaType} tmdbId={tmdbId} blocked={blocked} />
              )}

              {(menuBlock || menuTracking || menuRelink) && (
                <TitleMoreMenu>
                  {menuTracking && arrTracking && (
                    <ArrTrackingControls
                      mediaType={mediaType}
                      tmdbId={tmdbId}
                      tvdbId={tvdbId ?? null}
                      monitored={arrTracking.monitored}
                      variant="menu"
                    />
                  )}
                  {menuBlock && (
                    <BlockRequestsButton mediaType={mediaType} tmdbId={tmdbId} blocked={null} variant="menu" />
                  )}
                  {menuRelink && <RelinkTitleForm mediaType={mediaType} tmdbId={tmdbId} variant="menu" />}
                </TitleMoreMenu>
              )}
            </div>

            <MyTitleRequests requests={myRequests} />

            {/* Text stays at a readable measure however wide the column gets;
                the artwork shows through beside it. */}
            <div className="max-w-[860px] min-[2400px]:max-w-[980px]">
              {tagline && <p className="mt-[26px] text-[14px] italic text-text-secondary">{tagline}</p>}

              {overview && (
                <>
                  <h2
                    className={`font-display text-[18px] font-semibold leading-6 text-text-primary ${
                      tagline ? "mt-4" : "mt-[26px]"
                    }`}
                  >
                    {t("title.overview")}
                  </h2>
                  <p className="mt-1.5 text-[14px] leading-[22px] text-text-secondary min-[1800px]:text-[15px] min-[1800px]:leading-[24px]">
                    {overview}
                  </p>
                </>
              )}

              {credits.length > 0 && (
                <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 min-[1800px]:grid-cols-4">
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

          <aside className="min-w-0 sm:col-span-2 xl:col-span-1">
            <div className="rounded-2xl border border-border bg-bg-1/95 px-[18px] pb-4 pt-1 shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur-[20px]">
              {meta.ratingPercent !== null && (
                <div className="flex h-[50px] items-center justify-between gap-2.5">
                  <span className="font-display text-[22px] font-bold tracking-[-0.01em] text-accent">
                    ★ {t("title.ratingPercent", { percent: meta.ratingPercent })}
                  </span>
                  <span className="text-[11px] text-text-muted">{t("title.tmdbUserScore")}</span>
                </div>
              )}
              {sidebar.ratings && hasAnyRating(sidebar.ratings) && (
                <RatingsRow ratings={sidebar.ratings} imdbId={sidebar.imdbId} />
              )}
              <div className={meta.ratingPercent === null && !(sidebar.ratings && hasAnyRating(sidebar.ratings)) ? "[&>div:first-child]:border-t-0" : ""}>
                <SidebarRow label={t("title.sidebarStatus")} value={meta.statusLabel} />
                <SidebarRow label={t("title.originalTitle")} value={sidebar.originalTitle} />
                <SidebarRow
                  label={mediaType === "movie" ? t("title.releaseDate") : t("title.firstAirDate")}
                  value={sidebar.releaseDateLabel}
                />
                {sidebar.theatricalReleaseLabel && sidebar.theatricalReleaseLabel !== sidebar.releaseDateLabel && (
                  <SidebarRow label={t("title.theatricalRelease")} value={sidebar.theatricalReleaseLabel} />
                )}
                <SidebarRow label={t("title.digitalRelease")} value={sidebar.digitalReleaseLabel} />
                <SidebarRow label={t("title.nextAirDate")} value={sidebar.nextAirDateLabel} />
                <SidebarRow label={t("title.budget")} value={sidebar.budgetLabel} />
                <SidebarRow label={t("title.revenue")} value={sidebar.revenueLabel} />
                <SidebarRow label={t("title.originalLanguage")} value={sidebar.originalLanguageLabel} />
                <SidebarRow
                  label={t("title.productionCountry")}
                  value={sidebar.productionCountry ? `${sidebar.productionCountry.flag} ${sidebar.productionCountry.name}` : null}
                />
                <SidebarRow label={t("title.studio")} value={sidebar.studio} />
                <SidebarRow label={t("title.network")} value={meta.network} />
              </div>

              {sidebar.watchProviders.length > 0 && (
                <div className="border-t border-border pt-[14px]">
                  <div className="flex items-center justify-between gap-2">
                    <CapsLabel>{t("title.streamingOn")}</CapsLabel>
                    <span className="text-[11px] text-text-muted">{sidebar.streamingRegion}</span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {sidebar.watchProviders.map((provider) => {
                      const providerLogo = tmdbImageUrl(provider.logoPath, "w92");
                      const tile = (
                        <div
                          title={provider.name}
                          className="h-9 w-9 shrink-0 overflow-hidden rounded-[9px] bg-white shadow-[0_2px_6px_rgba(0,0,0,0.3)]"
                        >
                          {providerLogo && (
                            <Image
                              src={providerLogo}
                              alt={provider.name}
                              width={36}
                              height={36}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                      );
                      return sidebar.streamingLink ? (
                        <a key={provider.name} href={sidebar.streamingLink} target="_blank" rel="noreferrer">
                          {tile}
                        </a>
                      ) : (
                        <div key={provider.name}>{tile}</div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {file && (
              <div className="mt-4">
                <FileDetailsSection file={file} runtimeLabel={runtimeLabel ?? null} />
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
