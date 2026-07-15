import Image from "next/image";
import { tmdbImageUrl } from "@/lib/tmdb/client";

export function PersonHeader({
  name,
  biography,
  birthday,
  placeOfBirth,
  profilePath,
  favoriteAction,
}: {
  name: string;
  biography: string | null;
  birthday: string | null;
  placeOfBirth: string | null;
  profilePath: string | null;
  favoriteAction?: React.ReactNode;
}) {
  const src = tmdbImageUrl(profilePath, "w342");

  return (
    <div className="flex flex-col gap-8 sm:flex-row">
      <div className="relative aspect-[2/3] w-48 shrink-0 overflow-hidden rounded-xl bg-bg-2 ring-1 ring-border">
        {src && (
          <Image src={src} alt={name} fill sizes="192px" className="object-cover" />
        )}
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl text-text-primary">{name}</h1>
          {favoriteAction}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-text-secondary">
          {birthday && (
            <span>
              <span className="text-text-muted">Born </span>
              {new Date(birthday).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          )}
          {placeOfBirth && <span>{placeOfBirth}</span>}
        </div>
        {biography && (
          <p className="mt-4 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-text-secondary">
            {biography.length > 600 ? `${biography.slice(0, 600)}…` : biography}
          </p>
        )}
      </div>
    </div>
  );
}
