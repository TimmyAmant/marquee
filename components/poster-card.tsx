import Image from "next/image";
import Link from "next/link";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import type { LibraryStatus } from "@/components/status-badge";

// A thin colored strip across the bottom of the poster art, Sonarr-style —
// readable at a glance across a whole grid without having to read the badge
// text on each card. Reuses the app's existing owned/tracked color tokens so
// it stays consistent with the StatusBadge pill; red/purple/yellow have no
// dedicated tokens of their own since only owned/downloading appear as
// badges elsewhere, so Tailwind's default palette covers the rest.
const STATUS_BAR_CLASS: Record<LibraryStatus, string> = {
  owned: "bg-owned",
  tracked_downloading: "bg-tracked",
  tracked_monitored: "bg-red-500",
  coming_soon: "bg-purple-500",
  untracked: "bg-yellow-500",
};

export function PosterCard({
  href,
  posterPath,
  name,
  year,
  subtitle,
  meta,
  rating,
  overview,
  badge,
  status,
  quickAction,
  favoriteAction,
}: {
  href: string;
  posterPath: string | null;
  name: string;
  year?: string | null;
  subtitle?: string | null;
  meta?: string | null;
  rating?: number | null;
  overview?: string | null;
  badge?: React.ReactNode;
  /** Drives the colored status strip across the bottom of the poster art —
   * independent of `badge`, since callers already build that from the same
   * status and this shouldn't force them to restructure it. */
  status?: LibraryStatus;
  quickAction?: React.ReactNode;
  /** Rendered next to the year/subtitle line — a sibling of that line's own
   * link, not nested inside it, so a <button> never ends up inside an <a>. */
  favoriteAction?: React.ReactNode;
}) {
  const src = tmdbImageUrl(posterPath, "w342");

  return (
    <div className="group">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-bg-2 ring-1 ring-border transition-all group-hover:-translate-y-1 group-hover:ring-border-strong">
        <Link href={href} className="absolute inset-0 z-0">
          {src ? (
            <Image
              src={src}
              alt={name}
              fill
              sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 180px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-3 text-center font-display text-sm text-text-muted">
              {name}
            </div>
          )}
        </Link>

        {typeof rating === "number" && rating > 0 && (
          <div className="pointer-events-none absolute left-1.5 top-1.5 z-10 flex items-center gap-1 rounded-full bg-bg-0/80 px-2 py-0.5 text-[10px] font-medium text-accent backdrop-blur-sm">
            <span>★</span>
            {rating.toFixed(1)}
          </div>
        )}
        {badge && <div className="pointer-events-none absolute right-1.5 top-1.5 z-10">{badge}</div>}
        {status && (
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 h-1 ${STATUS_BAR_CLASS[status]}`}
          />
        )}

        {overview && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-end bg-gradient-to-t from-bg-0 via-bg-0/70 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
            <p className="line-clamp-5 text-xs leading-relaxed text-text-secondary">{overview}</p>
          </div>
        )}

        {quickAction && (
          <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 z-20 group-hover:pointer-events-auto">
            {quickAction}
          </div>
        )}
      </div>

      <Link href={href} className="mt-2 block">
        <p className="truncate text-sm font-medium text-text-primary">{name}</p>
      </Link>
      <div className="flex items-center justify-between gap-1.5">
        <Link href={href} className="min-w-0 flex-1">
          <p className="truncate text-xs text-text-muted">
            {[subtitle, year].filter(Boolean).join(" · ")}
          </p>
        </Link>
        {favoriteAction && <div className="shrink-0">{favoriteAction}</div>}
      </div>
      {meta && <p className="truncate text-xs text-text-muted">{meta}</p>}
    </div>
  );
}
