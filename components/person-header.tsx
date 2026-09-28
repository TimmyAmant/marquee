import { MediaImage } from "@/components/media-image";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import { getT } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/format";
import { rich } from "@/lib/i18n/rich";
import { EntityLinks } from "@/components/external-links";
import type { EntityLink } from "@/lib/tmdb/entity-links";

export async function PersonHeader({
  name,
  biography,
  birthday,
  placeOfBirth,
  profilePath,
  links = [],
  favoriteAction,
}: {
  name: string;
  biography: string | null;
  birthday: string | null;
  placeOfBirth: string | null;
  profilePath: string | null;
  /** IMDb, socials, website: pills under the bio. */
  links?: EntityLink[];
  favoriteAction?: React.ReactNode;
}) {
  const src = tmdbImageUrl(profilePath, "w500");
  const t = await getT();

  return (
    <div className="flex flex-col gap-8 sm:flex-row">
      <div className="relative aspect-[2/3] w-48 shrink-0 overflow-hidden rounded-xl bg-bg-2 shadow-[0_18px_44px_rgba(0,0,0,0.45)] ring-1 ring-border">
        {src && (
          <MediaImage src={src} alt={name} fill sizes="192px" className="object-cover" />
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl text-text-primary [text-shadow:0_2px_20px_rgba(0,0,0,0.25)]">{name}</h1>
          {favoriteAction}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-text-secondary">
          {birthday && (
            <span>
              {rich(t("discover.bornOn", { date: formatDate(t, birthday, "long", "UTC") }), {
                muted: (chunks) => <span className="text-text-muted">{chunks}</span>,
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
        {links.length > 0 && (
          <div className="mt-4">
            <EntityLinks links={links} />
          </div>
        )}
      </div>
    </div>
  );
}
