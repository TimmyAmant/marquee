import { TrailerButton } from "@/components/trailer-button";
import { buildExternalLinks, type ExternalLinkIds } from "@/lib/title-meta";
import { entityLinkBrand, type EntityLink } from "@/lib/tmdb/entity-links";
import { getT } from "@/lib/i18n/server";

export type ExternalLinksData = ExternalLinkIds & {
  trailerKey: string | null;
};

/** One outlined link capsule — the title page's Trailer / IMDb / Facebook
 * row, and a person's or studio's official links. */
export const LINK_PILL =
  "flex h-[30px] items-center rounded-[15px] border border-border-strong pl-[11px] pr-[13px] text-[12.5px] text-text-primary transition-colors hover:border-accent hover:text-accent";

export function ExternalLinks({ links }: { links: ExternalLinksData }) {
  const items = buildExternalLinks(links);

  if (items.length === 0 && !links.trailerKey) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {links.trailerKey && <TrailerButton videoKey={links.trailerKey} />}
      {items.map((item) => (
        <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer" className={LINK_PILL}>
          {item.label}
        </a>
      ))}
    </div>
  );
}

/** A person's (or studio's) IMDb, socials and website
 * (lib/tmdb/entity-links.ts), only the ones they have. */
export async function EntityLinks({ links }: { links: EntityLink[] }) {
  if (links.length === 0) return null;
  const t = await getT();

  return (
    <div className="flex flex-wrap gap-2" data-testid="entity-links">
      {links.map((link) => (
        <a key={link.kind} href={link.url} target="_blank" rel="noopener noreferrer" className={LINK_PILL}>
          {entityLinkBrand(link.kind) ?? t("discover.linkWebsite")}
        </a>
      ))}
    </div>
  );
}
