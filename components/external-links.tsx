import { TrailerButton } from "@/components/trailer-button";

export type ExternalLinksData = {
  trailerKey: string | null;
  imdbId: string | null;
  facebookId: string | null;
  instagramId: string | null;
  twitterId: string | null;
  tvdbId?: number | null;
  tvdbMediaType?: "series" | "movies";
};

export function ExternalLinks({ links }: { links: ExternalLinksData }) {
  const items: { label: string; href: string }[] = [];

  if (links.imdbId) {
    items.push({ label: "IMDb", href: `https://www.imdb.com/title/${links.imdbId}` });
  }
  if (links.tvdbId) {
    items.push({
      label: "TheTVDB",
      href: `https://www.thetvdb.com/dereferrer/${links.tvdbMediaType ?? "series"}/${links.tvdbId}`,
    });
  }
  if (links.instagramId) {
    items.push({ label: "Instagram", href: `https://www.instagram.com/${links.instagramId}` });
  }
  if (links.twitterId) {
    items.push({ label: "X / Twitter", href: `https://x.com/${links.twitterId}` });
  }
  if (links.facebookId) {
    items.push({ label: "Facebook", href: `https://www.facebook.com/${links.facebookId}` });
  }

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
          className="rounded-full border border-border px-3.5 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent hover:text-accent"
        >
          {item.label}
        </a>
      ))}
    </div>
  );
}
