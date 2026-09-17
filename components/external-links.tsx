import { TrailerButton } from "@/components/trailer-button";
import { buildExternalLinks, type ExternalLinkIds } from "@/lib/title-meta";

export type ExternalLinksData = ExternalLinkIds & {
  trailerKey: string | null;
};

export function ExternalLinks({ links }: { links: ExternalLinksData }) {
  const items = buildExternalLinks(links);

  if (items.length === 0 && !links.trailerKey) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {links.trailerKey && <TrailerButton videoKey={links.trailerKey} />}
      {items.map((item) => (
        <a
          key={item.label}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-[30px] items-center rounded-[15px] border border-border-strong pl-[11px] pr-[13px] text-[12.5px] text-text-primary transition-colors hover:border-accent hover:text-accent"
        >
          {item.label}
        </a>
      ))}
    </div>
  );
}
