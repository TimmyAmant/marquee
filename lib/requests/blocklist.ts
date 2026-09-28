import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Translator } from "@/lib/i18n/translator";
import { getT } from "@/lib/i18n/server";
import { db } from "@/lib/db/client";
import { requestBlocklist, requests, titles, type MediaType } from "@/lib/db/schema";
import { fail, type CoreResult } from "@/lib/core-result";
import type { TmdbMovieDetails, TmdbTvDetails } from "@/lib/tmdb/client";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { revalidatePathSafely } from "@/lib/cache/revalidate";

// The request blocklist: titles, or TMDb keywords/genres ("anime",
// "reality"), that nobody may request. Checked in createRequest (so the
// Plex Watchlist and 4K requests are covered too) and shown on the title
// page as "Requests are closed for this title". The admin can still add a
// blocked title to Sonarr/Radarr themselves.

export const MAX_BLOCK_REASON = 200;

export function normalizeKeyword(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80) : "";
}

/** A title's TMDb keywords and genres, lower-case. Pure; unit tested. */
export function titleTags(raw: unknown, mediaType: MediaType): string[] {
  if (!raw || typeof raw !== "object") return [];
  const keywords =
    mediaType === "movie"
      ? ((raw as TmdbMovieDetails).keywords?.keywords ?? [])
      : ((raw as TmdbTvDetails).keywords?.results ?? []);
  const genres = (raw as { genres?: { name: string }[] }).genres ?? [];
  return [...keywords, ...genres].map((k) => normalizeKeyword(k.name)).filter(Boolean);
}

/** A title's ratings: each country's certification ("US" "R"), from a
 * movie's release dates or a show's content ratings. Pure; unit tested. */
export function titleCertifications(raw: unknown, mediaType: MediaType): { region: string; rating: string }[] {
  if (!raw || typeof raw !== "object") return [];
  const out: { region: string; rating: string }[] = [];
  if (mediaType === "movie") {
    for (const country of (raw as TmdbMovieDetails).release_dates?.results ?? []) {
      for (const release of country.release_dates ?? []) {
        const rating = normalizeCertification(release.certification);
        if (rating) out.push({ region: country.iso_3166_1.toUpperCase(), rating });
      }
    }
  } else {
    for (const country of (raw as TmdbTvDetails).content_ratings?.results ?? []) {
      const rating = normalizeCertification(country.rating);
      if (rating) out.push({ region: country.iso_3166_1.toUpperCase(), rating });
    }
  }
  return out;
}

export function normalizeCertification(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, " ").slice(0, 20) : "";
}

export function normalizeRegion(value: unknown): string | null {
  const region = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{2}$/.test(region) ? region : null;
}

/** What an automatic block matches: a keyword or genre by name, a rating in
 * a country, or TMDb's adult flag. */
export type BlockRule =
  | { kind: "keyword"; keyword: string }
  | { kind: "certification"; region: string; rating: string }
  | { kind: "adult" };

/** Whether the rule blocks this title (its TMDb record). Pure; unit tested. */
export function ruleBlocks(rule: BlockRule, raw: unknown, mediaType: MediaType): boolean {
  switch (rule.kind) {
    case "keyword":
      return titleTags(raw, mediaType).includes(rule.keyword);
    case "certification":
      return titleCertifications(raw, mediaType).some((c) => c.region === rule.region && c.rating === rule.rating);
    case "adult":
      return Boolean(raw && typeof raw === "object" && (raw as { adult?: unknown }).adult === true);
  }
}

type BlocklistRow = typeof requestBlocklist.$inferSelect;

function ruleOf(row: BlocklistRow): BlockRule | null {
  if (row.kind === "keyword" && row.keyword) return { kind: "keyword", keyword: row.keyword };
  if (row.kind === "certification" && row.keyword && row.region) {
    return { kind: "certification", region: row.region, rating: row.keyword };
  }
  if (row.kind === "adult") return { kind: "adult" };
  return null;
}

/** How a rule is named where a title says why it's blocked. */
export function ruleLabel(rule: BlockRule): string {
  if (rule.kind === "keyword") return rule.keyword;
  if (rule.kind === "certification") return `${rule.rating} (${rule.region})`;
  return "adult";
}

export type BlockMatch = { reason: string | null; keyword: string | null };

/** Whether this title is blocked, and why; null when it isn't. */
export async function findBlock(mediaType: MediaType, tmdbId: number, raw?: unknown): Promise<BlockMatch | null> {
  const rows = await db.select().from(requestBlocklist);
  if (rows.length === 0) return null;
  const direct = rows.find((r) => r.kind === "title" && r.mediaType === mediaType && r.tmdbId === tmdbId);
  if (direct) return { reason: direct.reason, keyword: null };
  const rules = rows
    .map((row) => ({ row, rule: ruleOf(row) }))
    .filter((r): r is { row: BlocklistRow; rule: BlockRule } => r.rule !== null);
  if (rules.length === 0) return null;
  const record = raw !== undefined ? raw : (await getOrFetchTitle(mediaType, tmdbId).catch(() => null))?.rawTmdb;
  const hit = rules.find(({ rule }) => ruleBlocks(rule, record, mediaType));
  return hit ? { reason: hit.row.reason, keyword: ruleLabel(hit.rule) } : null;
}

/** Every blocked single title as "movie:603" — cheap enough for a page of
 * poster cards (keyword blocks need each title's TMDb record, so they're
 * left to the server's refusal there). */
export async function getBlockedTitleKeys(): Promise<Set<string>> {
  const rows = await db
    .select({ mediaType: requestBlocklist.mediaType, tmdbId: requestBlocklist.tmdbId })
    .from(requestBlocklist)
    .where(eq(requestBlocklist.kind, "title"));
  return new Set(rows.map((r) => `${r.mediaType}:${r.tmdbId}`));
}

/** The refusal createRequest gives. Pure. */
export function blockedMessage(t: Translator, block: BlockMatch): string {
  const base = t("notify.blocked");
  return block.reason ? `${base} ${block.reason}` : base;
}

export type BlocklistEntry = typeof requestBlocklist.$inferSelect;

export async function listBlocklist(): Promise<BlocklistEntry[]> {
  return db.select().from(requestBlocklist).orderBy(asc(requestBlocklist.kind), asc(requestBlocklist.createdAt));
}

function cleanReason(value: unknown): string | null {
  const reason = typeof value === "string" ? value.trim() : "";
  return reason ? reason.slice(0, MAX_BLOCK_REASON) : null;
}

export async function blockTitle(mediaType: MediaType, tmdbId: number, reason: unknown): Promise<CoreResult> {
  const title = await getOrFetchTitle(mediaType, tmdbId).catch(() => null);
  if (!title) return fail("upstream", (await getT())("notify.tmdbLookupFailed"));
  // Already blocked: blocking again just updates the reason.
  const updated = await db
    .update(requestBlocklist)
    .set({ reason: cleanReason(reason) })
    .where(
      and(eq(requestBlocklist.kind, "title"), eq(requestBlocklist.mediaType, mediaType), eq(requestBlocklist.tmdbId, tmdbId)),
    )
    .returning({ id: requestBlocklist.id });
  if (updated.length === 0) {
    await db
      .insert(requestBlocklist)
      .values({ kind: "title", mediaType, tmdbId, title: title.name, reason: cleanReason(reason) })
      .onConflictDoNothing();
  }
  revalidatePathSafely(`/title/${mediaType}/${tmdbId}`);
  return { ok: true };
}

export async function unblockTitle(mediaType: MediaType, tmdbId: number): Promise<CoreResult> {
  await db
    .delete(requestBlocklist)
    .where(
      and(eq(requestBlocklist.kind, "title"), eq(requestBlocklist.mediaType, mediaType), eq(requestBlocklist.tmdbId, tmdbId)),
    );
  revalidatePathSafely(`/title/${mediaType}/${tmdbId}`);
  return { ok: true };
}

export async function blockKeyword(keyword: unknown, reason: unknown): Promise<CoreResult> {
  const value = normalizeKeyword(keyword);
  if (!value) return fail("invalid", (await getT())("notify.blockEnterKeyword"));
  const updated = await db
    .update(requestBlocklist)
    .set({ reason: cleanReason(reason) })
    .where(and(eq(requestBlocklist.kind, "keyword"), eq(requestBlocklist.keyword, value)))
    .returning({ id: requestBlocklist.id });
  if (updated.length === 0) {
    await db
      .insert(requestBlocklist)
      .values({ kind: "keyword", keyword: value, reason: cleanReason(reason) })
      .onConflictDoNothing();
  }
  return { ok: true };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function removeBlocklistEntry(id: string): Promise<CoreResult> {
  if (!UUID.test(id)) return fail("not_found", (await getT())("notify.notOnBlocklist"));
  const removed = await db.delete(requestBlocklist).where(eq(requestBlocklist.id, id)).returning();
  if (removed.length === 0) return fail("not_found", (await getT())("notify.notOnBlocklist"));
  const [row] = removed;
  if (row.kind === "title" && row.mediaType && row.tmdbId) revalidatePathSafely(`/title/${row.mediaType}/${row.tmdbId}`);
  return { ok: true };
}

export async function blockCertification(region: unknown, rating: unknown, reason: unknown): Promise<CoreResult> {
  const t = await getT();
  const country = normalizeRegion(region);
  if (!country) return fail("invalid", t("notify.blockEnterRegion"));
  const value = normalizeCertification(rating);
  if (!value) return fail("invalid", t("notify.blockEnterCertification"));
  const updated = await db
    .update(requestBlocklist)
    .set({ reason: cleanReason(reason) })
    .where(
      and(eq(requestBlocklist.kind, "certification"), eq(requestBlocklist.region, country), eq(requestBlocklist.keyword, value)),
    )
    .returning({ id: requestBlocklist.id });
  if (updated.length === 0) {
    await db
      .insert(requestBlocklist)
      .values({ kind: "certification", region: country, keyword: value, reason: cleanReason(reason) })
      .onConflictDoNothing();
  }
  return { ok: true };
}

/** Blocks everything TMDb marks as adult; blocking again updates the reason. */
export async function blockAdult(reason: unknown): Promise<CoreResult> {
  const updated = await db
    .update(requestBlocklist)
    .set({ reason: cleanReason(reason) })
    .where(eq(requestBlocklist.kind, "adult"))
    .returning({ id: requestBlocklist.id });
  if (updated.length === 0) {
    await db.insert(requestBlocklist).values({ kind: "adult", reason: cleanReason(reason) }).onConflictDoNothing();
  }
  return { ok: true };
}

/** A rule as the API and Settings send it: { kind, keyword | region +
 * certification }. No kind is a keyword, as before. */
export async function parseBlockRule(body: Record<string, unknown>): Promise<CoreResult<{ rule: BlockRule }>> {
  const t = await getT();
  const kind = body.kind ?? "keyword";
  if (kind === "keyword") {
    const keyword = normalizeKeyword(body.keyword);
    return keyword ? { ok: true, rule: { kind, keyword } } : fail("invalid", t("notify.blockEnterKeyword"));
  }
  if (kind === "certification") {
    const region = normalizeRegion(body.region);
    if (!region) return fail("invalid", t("notify.blockEnterRegion"));
    const rating = normalizeCertification(body.certification);
    if (!rating) return fail("invalid", t("notify.blockEnterCertification"));
    return { ok: true, rule: { kind, region, rating } };
  }
  if (kind === "adult") return { ok: true, rule: { kind } };
  return fail("invalid", t("notify.blockKindInvalid"));
}

/** Adds a rule to the blocklist. */
export async function blockByRule(rule: BlockRule, reason: unknown): Promise<CoreResult> {
  if (rule.kind === "keyword") return blockKeyword(rule.keyword, reason);
  if (rule.kind === "certification") return blockCertification(rule.region, rule.rating, reason);
  return blockAdult(reason);
}

/** How many of Marquee's kept TMDb records a preview looks through. */
const PREVIEW_SCAN = 5000;
const PREVIEW_EXAMPLES = 24;

export type BlockPreview = {
  /** Titles Marquee has looked up that it would block (up to 24). */
  titles: { mediaType: MediaType; tmdbId: number; name: string; year: string | null }[];
  /** How many titles it looked through, and how many it would block. */
  scanned: number;
  matched: number;
  /** Requests still waiting for review that it would have blocked. */
  pendingRequests: { id: string; title: string; mediaType: MediaType; tmdbId: number }[];
};

/** What a rule would block, before it's added: among the titles anyone has
 * looked at here (the TMDb records Marquee keeps), and the requests still
 * waiting. Doesn't ask TMDb anything. */
export async function previewBlockRule(rule: BlockRule): Promise<BlockPreview> {
  const rows = await db
    .select({
      mediaType: titles.mediaType,
      tmdbId: titles.tmdbId,
      name: titles.name,
      releaseDate: titles.releaseDate,
      firstAirDate: titles.firstAirDate,
      raw: titles.rawTmdb,
    })
    .from(titles)
    .orderBy(desc(titles.refreshedAt))
    .limit(PREVIEW_SCAN);
  const matches = rows.filter((row) => ruleBlocks(rule, row.raw, row.mediaType));
  const matchedKeys = new Set(matches.map((m) => `${m.mediaType}:${m.tmdbId}`));
  const pending =
    matches.length === 0
      ? []
      : await db
          .select({ id: requests.id, title: requests.title, mediaType: requests.mediaType, tmdbId: requests.tmdbId })
          .from(requests)
          .where(and(eq(requests.status, "pending"), inArray(requests.tmdbId, [...new Set(matches.map((m) => m.tmdbId))])));
  return {
    titles: matches.slice(0, PREVIEW_EXAMPLES).map((m) => ({
      mediaType: m.mediaType,
      tmdbId: m.tmdbId,
      name: m.name,
      year: (m.releaseDate ?? m.firstAirDate)?.slice(0, 4) ?? null,
    })),
    scanned: rows.length,
    matched: matches.length,
    pendingRequests: pending.filter((r) => matchedKeys.has(`${r.mediaType}:${r.tmdbId}`)),
  };
}
