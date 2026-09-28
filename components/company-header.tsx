import Image from "next/image";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import { getT } from "@/lib/i18n/server";
import { EntityLinks } from "@/components/external-links";
import type { EntityLink } from "@/lib/tmdb/entity-links";

export async function CompanyHeader({
  name,
  description,
  logoPath,
  count,
  links = [],
  favoriteAction,
}: {
  name: string;
  description: string | null;
  logoPath: string | null;
  count: number;
  /** Only ever its website. */
  links?: EntityLink[];
  favoriteAction?: React.ReactNode;
}) {
  const src = tmdbImageUrl(logoPath, "w342");
  const t = await getT();

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
      <div className="flex h-24 w-40 shrink-0 items-center justify-center rounded-xl border border-border bg-white p-4">
        {src ? (
          <Image
            src={src}
            alt={name}
            width={140}
            height={80}
            className="max-h-full w-auto object-contain"
          />
        ) : (
          <span className="font-display text-lg text-bg-0">{name}</span>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl text-text-primary [text-shadow:0_2px_20px_rgba(0,0,0,0.25)]">{name}</h1>
          {favoriteAction}
        </div>
        <p className="mt-1 text-sm text-text-muted">{t("discover.catalogCount", { count })}</p>
        {description && (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
            {description.length > 400 ? `${description.slice(0, 400)}…` : description}
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
