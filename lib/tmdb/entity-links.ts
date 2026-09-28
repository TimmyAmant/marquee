// A person's (or a studio's) official links — IMDb, their socials and their
// own site — built from TMDb's external_ids and homepage. The person and
// company pages show them as a row of pills under the bio, and the API
// returns them as `externalLinks`. Pure, so it's unit tested directly.

export const entityLinkKinds = ["imdb", "instagram", "twitter", "facebook", "tiktok", "youtube", "homepage"] as const;
export type EntityLinkKind = (typeof entityLinkKinds)[number];

export type EntityLink = { kind: EntityLinkKind; url: string };

/** TMDb's person external_ids (append_to_response=external_ids). */
export type TmdbPersonExternalIds = {
  imdb_id?: string | null;
  instagram_id?: string | null;
  twitter_id?: string | null;
  facebook_id?: string | null;
  tiktok_id?: string | null;
  youtube_id?: string | null;
};

/** A handle as TMDb stores it — sometimes with a leading "@" or pasted as a
 * whole address — down to the bare handle; null when there's nothing usable. */
function handle(value: string | null | undefined): string | null {
  let text = (value ?? "").trim();
  if (!text) return null;
  // A full address: keep its last path segment.
  if (/^https?:\/\//i.test(text)) {
    try {
      const segments = new URL(text).pathname.split("/").filter(Boolean);
      text = segments.at(-1) ?? "";
    } catch {
      return null;
    }
  }
  text = text.replace(/^@+/, "");
  return /^[\p{L}\p{N}._-]+$/u.test(text) ? text : null;
}

/** Only an http(s) address counts as a homepage. */
function webAddress(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The links that exist, in display order: IMDb, Instagram, X, Facebook,
 * TikTok, YouTube, then their own website. */
export function buildEntityLinks(input: {
  externalIds?: TmdbPersonExternalIds | null;
  homepage?: string | null;
}): EntityLink[] {
  const ids = input.externalIds ?? {};
  const links: EntityLink[] = [];

  const imdb = (ids.imdb_id ?? "").trim();
  if (/^nm\d+$/.test(imdb)) links.push({ kind: "imdb", url: `https://www.imdb.com/name/${imdb}` });

  const instagram = handle(ids.instagram_id);
  if (instagram) links.push({ kind: "instagram", url: `https://www.instagram.com/${instagram}` });

  const twitter = handle(ids.twitter_id);
  if (twitter) links.push({ kind: "twitter", url: `https://x.com/${twitter}` });

  const facebook = handle(ids.facebook_id);
  if (facebook) links.push({ kind: "facebook", url: `https://www.facebook.com/${facebook}` });

  const tiktok = handle(ids.tiktok_id);
  if (tiktok) links.push({ kind: "tiktok", url: `https://www.tiktok.com/@${tiktok}` });

  const youtube = handle(ids.youtube_id);
  if (youtube) {
    // A channel id ("UC" + 22 characters) or a handle.
    const url = /^UC[\w-]{22}$/.test(youtube)
      ? `https://www.youtube.com/channel/${youtube}`
      : `https://www.youtube.com/@${youtube}`;
    links.push({ kind: "youtube", url });
  }

  const homepage = webAddress(input.homepage);
  if (homepage) links.push({ kind: "homepage", url: homepage });

  return links;
}
