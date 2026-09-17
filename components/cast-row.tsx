import Image from "next/image";
import Link from "next/link";
import { Shelf } from "@/components/shelf";
import { FavoriteButton } from "@/components/favorite-button";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import type { TmdbCastMember } from "@/lib/tmdb/client";
import { topBilledCast } from "@/lib/title-meta";

/** The design mockup's cast card: a 112x124 landscape-ish portrait rather
 * than a 2:3 poster, so a row of faces reads as a carousel of people and
 * not a second shelf of titles. */
function CastCard({
  member,
  favoriteAction,
}: {
  member: TmdbCastMember;
  favoriteAction?: React.ReactNode;
}) {
  const src = tmdbImageUrl(member.profile_path, "w342");

  return (
    <div className="w-[112px] shrink-0">
      <div className="relative h-[124px] w-[112px] overflow-hidden rounded-xl border border-border bg-bg-2">
        <Link href={`/person/${member.id}`} className="absolute inset-0">
          {src ? (
            <Image src={src} alt={member.name} fill sizes="112px" className="object-cover object-top" />
          ) : (
            <span className="flex h-full items-center justify-center px-2 text-center font-display text-[11px] text-text-muted">
              {member.name}
            </span>
          )}
        </Link>
        {/* The favorite toggle has no room on a 112px-wide caption, so it
            rides in the portrait's corner instead of the name line. */}
        {favoriteAction && (
          <div className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-bg-0/65 backdrop-blur-sm">
            {favoriteAction}
          </div>
        )}
      </div>
      <Link href={`/person/${member.id}`} className="block">
        <p className="mt-[7px] truncate text-[12.5px] font-medium leading-4 text-text-primary">
          {member.name}
        </p>
        {member.character && (
          <p className="truncate text-[11px] leading-[14px] text-text-muted">{member.character}</p>
        )}
      </Link>
    </div>
  );
}

export function CastRow({
  cast,
  favoritedIds,
  showFavorite,
}: {
  cast: TmdbCastMember[];
  favoritedIds?: Set<number>;
  showFavorite?: boolean;
}) {
  if (cast.length === 0) return null;

  const topBilled = topBilledCast(cast);

  return (
    <Shelf title="Cast" gap="tile" flushRight>
      {topBilled.map((member) => (
        <CastCard
          key={member.id}
          member={member}
          favoriteAction={
            showFavorite ? (
              <FavoriteButton
                entityType="person"
                tmdbId={member.id}
                initialFavorited={favoritedIds?.has(member.id) ?? false}
                compact
              />
            ) : undefined
          }
        />
      ))}
    </Shelf>
  );
}
