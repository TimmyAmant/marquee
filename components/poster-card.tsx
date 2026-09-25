import Link from "next/link";
import { MediaImage } from "@/components/media-image";
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
  filePath,
  typeLabel,
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
  /** On-disk file location, shown as a native hover tooltip over the poster
   * art — lets you spot a wrong Plex/Jellyfin/Sonarr/Radarr match (wrong
   * artwork/info for what's actually on disk) while scanning a grid,
   * without adding a permanently-visible line to every card. Only
   * meaningful for owned/tracked titles backed by a local file — omitted
   * (or null) elsewhere, e.g. Discover's TMDb-only cards. */
  filePath?: string | null;
  /** Corner pill reading "MOVIE" or "SERIES" — Discover's mixed-media rows
   * (Trending) use this so a title's type is clear without opening it;
   * single-type rows/grids elsewhere have no need for it. Shares the
   * top-left corner with `rating`, so pass at most one of the two. */
  typeLabel?: "MOVIE" | "SERIES";
}) {
  const src = tmdbImageUrl(posterPath, "w342");

  return (
    <div className="group">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-bg-2 ring-1 ring-border transition-all group-hover:-translate-y-1 group-hover:shadow-[0_16px_34px_rgba(0,0,0,0.6),0_4px_10px_rgba(0,0,0,0.4)] group-hover:ring-border-strong">
        <Link href={href} className="absolute inset-0 z-0" title={filePath ?? undefined}>
          {src ? (
            <MediaImage
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

        {typeLabel ? (
          <div
            className={`pointer-events-none absolute left-[7px] top-[7px] z-10 rounded-[4px] px-[5px] py-[3px] text-[9px] font-bold uppercase leading-none tracking-[0.05em] text-white shadow-[0_1px_3px_rgba(0,0,0,0.35)] ${
              typeLabel === "MOVIE" ? "bg-blue-600" : "bg-fuchsia-600"
            }`}
          >
            {typeLabel}
          </div>
        ) : (
          typeof rating === "number" &&
          rating > 0 && (
            <div className="pointer-events-none absolute left-[7px] top-[7px] z-10 flex h-[17px] items-center gap-1 rounded-[9px] bg-bg-0/80 px-[6px] text-[10px] font-semibold text-accent backdrop-blur-sm">
              <span>★</span>
              {rating.toFixed(1)}
            </div>
          )
        )}
        {badge && <div className="pointer-events-none absolute right-1.5 top-1.5 z-10">{badge}</div>}
        {status && (
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[3px] ${STATUS_BAR_CLASS[status]}`}
          />
        )}

        {overview && (
          <div
            className={`pointer-events-none absolute inset-0 z-10 flex flex-col justify-end px-[9px] pb-[9px] pt-[10px] opacity-0 transition-opacity group-hover:opacity-100 ${
              quickAction ? "pb-[43px]" : ""
            }`}
            style={{
              background:
                "linear-gradient(to top, color-mix(in srgb, var(--marquee-bg-0) 97%, transparent) 0%, color-mix(in srgb, var(--marquee-bg-0) 92%, transparent) 46%, color-mix(in srgb, var(--marquee-bg-0) 55%, transparent) 70%, color-mix(in srgb, var(--marquee-bg-0) 18%, transparent) 100%)",
            }}
          >
            <p className="line-clamp-5 text-[11px] leading-[15px] text-text-secondary">{overview}</p>
          </div>
        )}

        {quickAction && (
          // Hidden-until-hover only makes sense with a mouse — on touch
          // devices there's no hover state to reveal it, so the button
          // would be invisible and untappable forever. Gated behind
          // `(hover: hover)` (a real pointer) rather than a screen-size
          // breakpoint, since what matters is input capability, not
          // viewport width — a touch laptop still needs it always visible.
          <div className="pointer-events-auto absolute inset-x-[9px] bottom-[9px] z-20 [@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:group-hover:pointer-events-auto">
            {quickAction}
          </div>
        )}
      </div>

      <div className="px-0.5 pt-2">
        <Link href={href} className="block">
          <p className="truncate text-[13px] font-medium leading-[17px] text-text-primary">{name}</p>
        </Link>
        <div className="mt-px flex items-center justify-between gap-1.5">
          <Link href={href} className="min-w-0 flex-1">
            <p className="truncate text-[11.5px] leading-[15px] text-text-muted">
              {[subtitle, year].filter(Boolean).join(" · ")}
            </p>
          </Link>
          {favoriteAction && <div className="shrink-0">{favoriteAction}</div>}
        </div>
        {meta && <p className="truncate text-[11.5px] leading-[15px] text-text-muted">{meta}</p>}
      </div>
    </div>
  );
}
