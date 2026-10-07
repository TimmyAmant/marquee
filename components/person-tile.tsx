import Image from "next/image";
import Link from "next/link";
import { tmdbImageUrl } from "@/lib/tmdb/image";

/** Search's person card: a round photo, the name, and what they're known
 * for ("Acting · Forrest Gump, Cast Away") — round so a grid of people never
 * reads as another row of posters. Fills its grid cell. */
export function PersonTile({
  tmdbId,
  name,
  profilePath,
  detail,
  favoriteAction,
}: {
  tmdbId: number;
  name: string;
  profilePath: string | null;
  /** The known-for line under the name. */
  detail?: string | null;
  favoriteAction?: React.ReactNode;
}) {
  const src = tmdbImageUrl(profilePath, "w185");
  const href = `/person/${tmdbId}`;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="group min-w-0 text-center">
      <div className="relative mx-auto aspect-square w-full max-w-[140px]">
        <Link
          href={href}
          className="absolute inset-0 overflow-hidden rounded-full border border-border bg-bg-2 transition-colors group-hover:border-accent"
        >
          {src ? (
            <Image src={src} alt={name} fill sizes="140px" className="object-cover object-top" />
          ) : (
            <span className="flex h-full items-center justify-center font-display text-2xl text-text-muted" aria-hidden>
              {initials}
            </span>
          )}
        </Link>
        {favoriteAction && (
          <div className="absolute right-[6%] top-[6%] z-10 flex h-6 w-6 items-center justify-center rounded-full bg-bg-0/85">
            {favoriteAction}
          </div>
        )}
      </div>
      <Link href={href} className="mt-2 block min-w-0">
        <p className="truncate text-[13px] font-medium leading-4 text-text-primary">{name}</p>
        {detail && <p className="mt-0.5 line-clamp-2 text-[11px] leading-[14px] text-text-muted">{detail}</p>}
      </Link>
    </div>
  );
}

/** The known-for line: department, then up to three titles. */
export function knownForLine(department: string | null | undefined, titles: readonly string[] | undefined): string | null {
  const list = (titles ?? []).filter(Boolean).join(", ");
  if (department && list) return `${department} · ${list}`;
  return department || list || null;
}
