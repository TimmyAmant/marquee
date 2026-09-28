import type { ArrProvider } from "@/lib/db/schema";
import { kindLabel } from "@/lib/arr/instances";
import { can, type PermissionSubject } from "@/lib/users/permissions";

// "Open in Radarr" / "Open in Sonarr" on a title page: the title's own page
// in each Sonarr/Radarr that has it, standard and 4K. Pure — the lookup is
// lib/arr/title-links.ts. Only for whoever may manage requests: the address
// is usually an internal one (lib/pages/title.ts decides who gets them).

/** One "Open in …" link (the API's `viewer.arrLinks`, 0.63+). */
export type ArrLink = {
  kind: ArrProvider;
  /** The server's name in Settings › Services. */
  serverName: string;
  is4k: boolean;
  url: string;
};

/** Who gets the links: the admin, and whoever may review requests — the
 * people who'd otherwise go looking for the title in Radarr/Sonarr. Never a
 * member without it: the addresses are the admin's own, often internal. */
export function seesArrLinks(user: PermissionSubject | null | undefined): boolean {
  return can(user, "reviewRequests");
}

/** Where a browser should open this server: its "Public URL (for links)"
 * when set, else the address Marquee uses. Trailing slashes off. */
export function arrLinkBase(server: { baseUrl: string; publicUrl?: string | null }): string {
  const base = server.publicUrl?.trim() || server.baseUrl.trim();
  return base.replace(/\/+$/, "");
}

/** The title's page inside Radarr/Sonarr. Radarr (v3 and later) routes
 * /movie/{titleSlug} — since v4 the slug is the TMDb id itself, which is also
 * the fallback when a server sends none. Sonarr routes /series/{titleSlug}
 * and has no id fallback, so without a slug there's no link. */
export function arrTitlePath(
  kind: ArrProvider,
  entry: { titleSlug?: string | null; tmdbId?: number | null },
): string | null {
  const slug = entry.titleSlug?.trim();
  if (kind === "radarr") {
    const key = slug || (entry.tmdbId ? String(entry.tmdbId) : "");
    return key ? `/movie/${encodeURIComponent(key)}` : null;
  }
  return slug ? `/series/${encodeURIComponent(slug)}` : null;
}

/** The whole link for one server's copy of the title, or null. */
export function arrTitleLink(
  server: { kind: ArrProvider; name: string; is4k: boolean; baseUrl: string; publicUrl?: string | null },
  entry: { titleSlug?: string | null; tmdbId?: number | null },
): ArrLink | null {
  const path = arrTitlePath(server.kind, entry);
  const base = arrLinkBase(server);
  if (!path || !base) return null;
  return { kind: server.kind, serverName: server.name, is4k: server.is4k, url: `${base}${path}` };
}

/**
 * What each link's button calls its server: "Radarr" / "Radarr 4K" when it's
 * the only one of its kind and 4K-ness, the server's own name when there are
 * several (Settings names them). The website, Mac and Windows apps all label
 * `viewer.arrLinks` by this rule — "Open in {name}".
 */
export function arrLinkNames(links: readonly Pick<ArrLink, "kind" | "serverName" | "is4k">[]): string[] {
  return links.map((link) => {
    const siblings = links.filter((l) => l.kind === link.kind && l.is4k === link.is4k).length;
    if (siblings > 1) return link.serverName;
    return link.is4k ? `${kindLabel(link.kind)} 4K` : kindLabel(link.kind);
  });
}
