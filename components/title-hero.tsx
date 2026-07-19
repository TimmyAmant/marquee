import Image from "next/image";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import type { LibraryStatus } from "@/components/status-badge";
import { AddToLibraryButton } from "@/components/add-to-library-button";
import { ExternalLinks, type ExternalLinksData } from "@/components/external-links";
import { FavoriteButton } from "@/components/favorite-button";
import { RelinkTitleForm } from "@/components/relink-title-form";

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

export function TitleHero({
  mediaType,
  tmdbId,
  name,
  overview,
  posterPath,
  backdropPath,
  meta,
  status,
  configured,
  file,
  links,
  favorited,
  isAdmin,
  alreadyRequested,
  otherRequesters,
}: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  name: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  meta: TitleMeta;
  status: LibraryStatus;
  configured: boolean;
  file: { path: string | null; sizeBytes: number; quality?: string } | null;
  links: ExternalLinksData;
  /** Omitted entirely (no button shown) when signed out. */
  favorited?: boolean;
  isAdmin?: boolean;
  alreadyRequested?: boolean;
  otherRequesters?: string[];
}) {
  const metaParts = [
    meta.runtimeLabel,
    meta.ratingPercent !== null ? `★ ${meta.ratingPercent}%` : null,
    meta.genres.length > 0 ? meta.genres.join(", ") : null,
    meta.yearRange,
    meta.statusLabel,
    meta.network,
  ].filter((v): v is string => Boolean(v));
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

      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 pb-4 pt-[220px] sm:flex-row">
        <div className="relative aspect-[2/3] w-56 shrink-0 overflow-hidden rounded-xl bg-bg-2 shadow-2xl ring-1 ring-border-strong">
          {poster && <Image src={poster} alt={name} fill sizes="224px" className="object-cover" />}
        </div>

        <div className="flex flex-col justify-end">
          <h1 className="font-display text-4xl text-text-primary sm:text-5xl">{name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
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
              file={file}
              isAdmin={isAdmin}
              alreadyRequested={alreadyRequested}
              otherRequesters={otherRequesters}
            />
          </div>

          {overview && (
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-text-secondary">
              {overview}
            </p>
          )}

          <div className="mt-5">
            <ExternalLinks links={links} />
          </div>

          {isAdmin && status !== "untracked" && (
            <div className="mt-4">
              <RelinkTitleForm mediaType={mediaType} tmdbId={tmdbId} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
