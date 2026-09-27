import { englishT } from "@/lib/i18n/catalog";
import type { Translator } from "@/lib/i18n/translator";
import { outboundUrlError } from "@/lib/notifications/outbound";
import { normalizeSeerrUrl } from "@/lib/import/seerr/mapping";
import type {
  SeerrArrServer,
  SeerrBlocklistItem,
  SeerrIssue,
  SeerrPage,
  SeerrQuota,
  SeerrRequest,
  SeerrUser,
} from "@/lib/import/seerr/types";

// Reading a Seerr / Overseerr / Jellyseerr server's API with its admin API
// key (`X-Api-Key`), for lib/import/seerr. Like the other integration
// addresses the admin types in (Sonarr, Jellyfin), the server is usually
// on the home network, so private addresses are allowed — but only the
// admin can start an import, the address has to be a plain http(s) URL
// without credentials, redirects are never followed (a redirect would
// carry the key somewhere else), every call has a timeout and answers are
// capped in size. The key lives in memory for the import and is never
// stored or logged.

export type SeerrConnection = { baseUrl: string; apiKey: string };

const REQUEST_TIMEOUT_MS = 20_000;
/** A page of 100 requests with their users is well under a megabyte. */
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const PAGE_SIZE = 100;
/** Pages read at most per listing — 50,000 items, far beyond any Seerr. */
const MAX_PAGES = 500;

/** What's wrong with a Seerr address, in `t`'s language; null when it's
 * usable. Pure; unit tested. */
export function seerrUrlError(raw: string, t: Translator = englishT()): string | null {
  const normalized = normalizeSeerrUrl(raw);
  if (!normalized) return t("notify.urlNotFull");
  return outboundUrlError(normalized, { allowPrivate: true }, t);
}

export class SeerrApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
  ) {
    super(`Seerr answered ${status} for ${path}`);
    this.name = "SeerrApiError";
  }
}

async function readCapped(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error("Seerr's answer was too large");
    }
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

/** GET `path` (relative to /api/v1) as JSON. Throws SeerrApiError for a
 * non-2xx answer, and a plain Error when the server can't be reached or
 * doesn't answer JSON. */
export async function seerrGet<T>(connection: SeerrConnection, path: string, query: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${connection.baseUrl}/api/v1${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    method: "GET",
    headers: { "X-Api-Key": connection.apiKey, Accept: "application/json", "User-Agent": "Marquee" },
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new SeerrApiError(response.status, path);
  }
  const text = await readCapped(response);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Seerr didn't answer JSON for ${path}`);
  }
}

/** Every item of a paginated listing (`take`/`skip`), in order. */
export async function seerrGetAll<T>(connection: SeerrConnection, path: string, query: Record<string, string | number> = {}): Promise<T[]> {
  const items: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await seerrGet<SeerrPage<T>>(connection, path, { ...query, take: PAGE_SIZE, skip: page * PAGE_SIZE });
    const results = Array.isArray(result.results) ? result.results : [];
    items.push(...results);
    const pages = result.pageInfo?.pages;
    if (results.length < PAGE_SIZE || (typeof pages === "number" && page + 1 >= pages)) break;
  }
  return items;
}

export type SeerrStatus = { version?: string; commitTag?: string };
export type SeerrMainSettings = { applicationTitle?: string; applicationUrl?: string };

export const fetchSeerrStatus = (c: SeerrConnection) => seerrGet<SeerrStatus>(c, "/status");
export const fetchSeerrMe = (c: SeerrConnection) => seerrGet<SeerrUser>(c, "/auth/me");
export const fetchSeerrMainSettings = (c: SeerrConnection) => seerrGet<SeerrMainSettings>(c, "/settings/main");
export const fetchSeerrUsers = (c: SeerrConnection) => seerrGetAll<SeerrUser>(c, "/user", { sort: "created" });
export const fetchSeerrUserQuota = (c: SeerrConnection, userId: number) => seerrGet<SeerrQuota>(c, `/user/${userId}/quota`);
export const fetchSeerrRequests = (c: SeerrConnection) => seerrGetAll<SeerrRequest>(c, "/request", { filter: "all", sort: "added", sortDirection: "asc" });
export const fetchSeerrIssues = (c: SeerrConnection) => seerrGetAll<SeerrIssue>(c, "/issue", { filter: "all", sort: "added" });
export const fetchSeerrIssue = (c: SeerrConnection, issueId: number) => seerrGet<SeerrIssue>(c, `/issue/${issueId}`);
export const fetchSeerrRadarrServers = (c: SeerrConnection) => seerrGet<SeerrArrServer[]>(c, "/settings/radarr");
export const fetchSeerrSonarrServers = (c: SeerrConnection) => seerrGet<SeerrArrServer[]>(c, "/settings/sonarr");

/** The blocklist: `/blocklist` on Seerr, `/blacklist` on Jellyseerr before
 * the rename (Overseerr never had one — an empty list). */
export async function fetchSeerrBlocklist(c: SeerrConnection): Promise<SeerrBlocklistItem[]> {
  try {
    return await seerrGetAll<SeerrBlocklistItem>(c, "/blocklist", { filter: "all" });
  } catch (err) {
    if (!(err instanceof SeerrApiError) || err.status !== 404) throw err;
  }
  try {
    return await seerrGetAll<SeerrBlocklistItem>(c, "/blacklist", { filter: "all" });
  } catch (err) {
    if (err instanceof SeerrApiError && err.status === 404) return [];
    throw err;
  }
}
