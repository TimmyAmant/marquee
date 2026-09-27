import Image from "next/image";
import Link from "next/link";
import { tmdbImageUrl } from "@/lib/tmdb/image";

/** A big logo tile for Discover's Studios/Networks rows — shown in the
 * company's own colors, on a white backdrop behind the artwork itself
 * (not the whole card) so a black-line-art mark and a full-color logo are
 * both readable, the same fix StudioChip already uses for the same reason:
 * TMDb assets are a mix of transparent dark marks and opaque full-color
 * logos, and only one of those is visible against this app's dark cards.
 *
 * `fluid` fills its grid cell instead of the shelf's fixed 224px (search's
 * Studios & Networks grid); `caption` and `favoriteAction` add a small
 * line under the tile and a star in its corner. */
/** "Dune Productions" → "DP": up to two initials. */
export function monogram(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
    .join("");
}

export function LogoCard({
  href,
  name,
  logoPath,
  fluid = false,
  caption,
  favoriteAction,
}: {
  href: string;
  name: string;
  logoPath: string | null;
  fluid?: boolean;
  caption?: string;
  favoriteAction?: React.ReactNode;
}) {
  const logo = tmdbImageUrl(logoPath, "w500");

  const tile = (
    <Link
      href={href}
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-bg-1 transition-colors hover:border-border-strong ${
        fluid ? "h-24 w-full sm:h-28" : "h-28 w-56"
      }`}
    >
      {logo ? (
        <div className={`flex h-full w-full items-center justify-center bg-white ${fluid ? "p-4 sm:p-5" : "p-5"}`}>
          <Image
            src={logo}
            alt={name}
            width={160}
            height={64}
            className="h-full w-full object-contain"
          />
        </div>
      ) : caption ? (
        // The name is already in the caption underneath: a monogram here
        // rather than the name twice.
        <span className="font-display text-3xl text-text-muted" aria-hidden>
          {monogram(name)}
        </span>
      ) : (
        <span className="px-4 text-center text-sm text-text-secondary">{name}</span>
      )}
    </Link>
  );

  if (!caption && !favoriteAction) return tile;

  return (
    <div className={fluid ? "min-w-0" : "w-56 shrink-0"}>
      <div className="relative">
        {tile}
        {favoriteAction && (
          <div className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-bg-0/70 backdrop-blur-sm">
            {favoriteAction}
          </div>
        )}
      </div>
      <Link href={href} className="mt-1.5 block min-w-0">
        <p className="truncate text-[12.5px] font-medium leading-4 text-text-primary">{name}</p>
        {caption && <p className="truncate text-[11px] leading-[14px] text-text-muted">{caption}</p>}
      </Link>
    </div>
  );
}
