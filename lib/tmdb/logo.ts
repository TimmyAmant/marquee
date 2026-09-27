// A title's "logo" — the transparent title-treatment artwork TMDb keeps
// alongside posters and backdrops (`/images` → `logos`), which the title page
// shows in place of the plain-text name the way streaming apps do. Pure, so
// both the TMDb client (which trims the list before it's cached) and the page
// can use it.

export interface TmdbLogoImage {
  file_path: string;
  iso_639_1: string | null;
  aspect_ratio: number;
  vote_average?: number;
  vote_count?: number;
  width?: number;
}

/** What `append_to_response=images` adds to a movie's or show's details. */
export interface TmdbTitleImages {
  logos?: TmdbLogoImage[];
}

/**
 * The best English (or language-less) logo, or null. Only PNGs: TMDb also
 * holds SVG logos, which next/image won't optimize and which can carry
 * scripts. Very tall artwork (a stacked logo taller than it is wide) is
 * skipped too — it would take over the hero instead of standing in for one
 * line of title text.
 */
export function pickTitleLogo(images: TmdbTitleImages | null | undefined): TmdbLogoImage | null {
  const usable = (images?.logos ?? []).filter(
    (logo) =>
      typeof logo.file_path === "string" &&
      /\.png$/i.test(logo.file_path) &&
      (logo.iso_639_1 === "en" || logo.iso_639_1 === null) &&
      logo.aspect_ratio >= 1,
  );
  if (usable.length === 0) return null;
  // English first (a language-less logo is usually a symbol, not the name),
  // then TMDb's own ranking by votes.
  const rank = (logo: TmdbLogoImage) => (logo.iso_639_1 === "en" ? 1 : 0);
  return [...usable].sort(
    (a, b) =>
      rank(b) - rank(a) ||
      (b.vote_average ?? 0) - (a.vote_average ?? 0) ||
      (b.vote_count ?? 0) - (a.vote_count ?? 0),
  )[0];
}

/** Keeps only the chosen logo, so the cached details don't carry TMDb's
 * whole image list (dozens of entries) for the one picture the page uses. */
export function trimTitleImages<T extends { images?: TmdbTitleImages }>(details: T): T {
  if (!details.images) return details;
  const logo = pickTitleLogo(details.images);
  return { ...details, images: { logos: logo ? [logo] : [] } };
}
