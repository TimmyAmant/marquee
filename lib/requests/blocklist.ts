import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requestBlocklist, type MediaType } from "@/lib/db/schema";
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

export type BlockMatch = { reason: string | null; keyword: string | null };

/** Whether this title is blocked, and why; null when it isn't. */
export async function findBlock(mediaType: MediaType, tmdbId: number, raw?: unknown): Promise<BlockMatch | null> {
  const rows = await db.select().from(requestBlocklist);
  if (rows.length === 0) return null;
  const direct = rows.find((r) => r.kind === "title" && r.mediaType === mediaType && r.tmdbId === tmdbId);
  if (direct) return { reason: direct.reason, keyword: null };
  const keywords = rows.filter((r) => r.kind === "keyword" && r.keyword);
  if (keywords.length === 0) return null;
  const tags = new Set(
    titleTags(raw !== undefined ? raw : (await getOrFetchTitle(mediaType, tmdbId).catch(() => null))?.rawTmdb, mediaType),
  );
  const hit = keywords.find((r) => tags.has(r.keyword!));
  return hit ? { reason: hit.reason, keyword: hit.keyword } : null;
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
export function blockedMessage(block: BlockMatch): string {
  const base = "The admin isn't taking requests for this title.";
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
  if (!title) return fail("upstream", "Couldn't look this title up with TMDb right now.");
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
  if (!value) return fail("invalid", "Enter a keyword or genre, like anime.");
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
  if (!UUID.test(id)) return fail("not_found", "Not on the blocklist.");
  const removed = await db.delete(requestBlocklist).where(eq(requestBlocklist.id, id)).returning();
  if (removed.length === 0) return fail("not_found", "Not on the blocklist.");
  const [row] = removed;
  if (row.kind === "title" && row.mediaType && row.tmdbId) revalidatePathSafely(`/title/${row.mediaType}/${row.tmdbId}`);
  return { ok: true };
}
