import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { issues, users, issueKindValues, type IssueKind, type MediaType } from "@/lib/db/schema";
import { fail, type CoreResult } from "@/lib/core-result";
import { getAdminUserId } from "@/lib/auth/get-admin";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { createNotification } from "@/lib/notifications/query";
import { searchTitle } from "@/lib/arr/title-actions";
import { revalidatePathSafely } from "@/lib/cache/revalidate";

// "Report a problem" (the title page), and the admin's side of it on the
// Requests page: see what's wrong, have Sonarr/Radarr look for a better
// copy, and mark it fixed — the reporter is told either way.

export const ISSUE_KIND_LABELS: Record<IssueKind, string> = {
  video: "Bad video quality",
  audio: "Audio problem",
  subtitles: "Subtitles missing or wrong",
  wont_play: "Won't play",
  wrong_title: "Wrong movie or episode",
  other: "Something else",
};

export const MAX_ISSUE_MESSAGE = 1000;
export const MAX_ISSUE_RESOLUTION = 500;
/** Open reports per person at once — plenty, and stops a flood. */
export const MAX_OPEN_ISSUES_PER_USER = 20;

export type ReportInput = { kind: unknown; message?: unknown; seasonNumber?: unknown; episodeNumber?: unknown };

function wholeNumber(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(n) && n >= 0 && n <= 10_000 ? n : "invalid";
}

/** Checks a report's fields. Pure; unit tested. */
export function parseReport(
  mediaType: MediaType,
  input: ReportInput,
):
  | { ok: true; kind: IssueKind; message: string | null; seasonNumber: number | null; episodeNumber: number | null }
  | { ok: false; error: string } {
  if (typeof input.kind !== "string" || !(issueKindValues as readonly string[]).includes(input.kind)) {
    return { ok: false, error: "Pick what's wrong." };
  }
  const kind = input.kind as IssueKind;
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (message.length > MAX_ISSUE_MESSAGE) return { ok: false, error: `Keep it under ${MAX_ISSUE_MESSAGE} characters.` };
  if (kind === "other" && !message) return { ok: false, error: "Say what's wrong." };
  let seasonNumber = wholeNumber(input.seasonNumber);
  let episodeNumber = wholeNumber(input.episodeNumber);
  if (seasonNumber === "invalid" || episodeNumber === "invalid") {
    return { ok: false, error: "Season and episode are whole numbers." };
  }
  if (mediaType === "movie") {
    seasonNumber = null;
    episodeNumber = null;
  } else if (episodeNumber !== null && seasonNumber === null) {
    return { ok: false, error: "Pick the season too." };
  }
  return { ok: true, kind, message: message || null, seasonNumber, episodeNumber };
}

/** "S2 E5", "Season 2", or null. Pure. */
export function issueEpisodeLabel(seasonNumber: number | null, episodeNumber: number | null): string | null {
  if (seasonNumber === null) return null;
  if (episodeNumber === null) return seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`;
  return `S${seasonNumber} E${episodeNumber}`;
}

function describe(title: string, seasonNumber: number | null, episodeNumber: number | null): string {
  const episode = issueEpisodeLabel(seasonNumber, episodeNumber);
  return episode ? `"${title}" (${episode})` : `"${title}"`;
}

export async function reportIssue(
  userId: string,
  mediaType: MediaType,
  tmdbId: number,
  input: ReportInput,
): Promise<CoreResult<{ issueId: string }>> {
  const parsed = parseReport(mediaType, input);
  if (!parsed.ok) return fail("invalid", parsed.error);

  const [open] = await db
    .select({ count: count() })
    .from(issues)
    .where(and(eq(issues.reportedByUserId, userId), eq(issues.status, "open")));
  if ((open?.count ?? 0) >= MAX_OPEN_ISSUES_PER_USER) {
    return fail("rate_limited", "You have a lot of open reports already. Wait until some are fixed.");
  }

  const title = await getOrFetchTitle(mediaType, tmdbId).catch(() => null);
  if (!title) return fail("upstream", "Couldn't look this title up with TMDb right now.");

  const [row] = await db
    .insert(issues)
    .values({
      reportedByUserId: userId,
      mediaType,
      tmdbId,
      title: title.name,
      posterPath: title.posterPath,
      seasonNumber: parsed.seasonNumber,
      episodeNumber: parsed.episodeNumber,
      kind: parsed.kind,
      message: parsed.message,
    })
    .returning({ id: issues.id });

  const adminUserId = await getAdminUserId();
  if (adminUserId && adminUserId !== userId) {
    const [reporter] = await db
      .select({ name: users.displayName, username: users.username })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    await createNotification({
      userId: adminUserId,
      mediaType,
      tmdbId,
      title: title.name,
      eventType: "issue_reported",
      message: `${reporter?.name || reporter?.username || "Someone"} reported a problem with ${describe(
        title.name,
        parsed.seasonNumber,
        parsed.episodeNumber,
      )}: ${ISSUE_KIND_LABELS[parsed.kind]}`,
    }).catch(() => undefined);
  }

  revalidatePathSafely("/requests");
  return { ok: true, issueId: row.id };
}

export type IssueRow = {
  id: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  kind: IssueKind;
  message: string | null;
  status: "open" | "resolved";
  resolution: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  reportedByUserId: string;
  reportedByName: string | null;
  reportedByUsername: string;
};

const RECENT_RESOLVED = 30;

/** The admin sees every open report and the latest fixed ones; a member only
 * their own. Newest first. */
export async function listIssues(viewer: { userId: string; isAdmin: boolean }): Promise<IssueRow[]> {
  const columns = {
    id: issues.id,
    mediaType: issues.mediaType,
    tmdbId: issues.tmdbId,
    title: issues.title,
    posterPath: issues.posterPath,
    seasonNumber: issues.seasonNumber,
    episodeNumber: issues.episodeNumber,
    kind: issues.kind,
    message: issues.message,
    status: issues.status,
    resolution: issues.resolution,
    createdAt: issues.createdAt,
    resolvedAt: issues.resolvedAt,
    reportedByUserId: issues.reportedByUserId,
    reportedByName: users.displayName,
    reportedByUsername: users.username,
  };
  const base = db.select(columns).from(issues).innerJoin(users, eq(users.id, issues.reportedByUserId));
  if (!viewer.isAdmin) {
    return base.where(eq(issues.reportedByUserId, viewer.userId)).orderBy(desc(issues.createdAt)).limit(100);
  }
  const [open, resolved] = await Promise.all([
    base.where(eq(issues.status, "open")).orderBy(desc(issues.createdAt)),
    db
      .select(columns)
      .from(issues)
      .innerJoin(users, eq(users.id, issues.reportedByUserId))
      .where(eq(issues.status, "resolved"))
      .orderBy(desc(issues.resolvedAt))
      .limit(RECENT_RESOLVED),
  ]);
  return [...open, ...resolved];
}

export async function getOpenIssueCount(): Promise<number> {
  const [row] = await db.select({ count: count() }).from(issues).where(eq(issues.status, "open"));
  return row?.count ?? 0;
}

/** The viewer's open reports for one title — the title page says "You
 * reported a problem" instead of offering a duplicate. */
export async function getOpenIssuesFor(userId: string, mediaType: MediaType, tmdbId: number): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(issues)
    .where(
      and(
        eq(issues.reportedByUserId, userId),
        eq(issues.mediaType, mediaType),
        eq(issues.tmdbId, tmdbId),
        eq(issues.status, "open"),
      ),
    );
  return row?.count ?? 0;
}

/** Marks it fixed (admin) and tells the reporter, with the admin's note. */
export async function resolveIssue(
  adminUserId: string,
  issueId: string,
  note: unknown,
): Promise<CoreResult> {
  const resolution = typeof note === "string" ? note.trim() : "";
  if (resolution.length > MAX_ISSUE_RESOLUTION) {
    return fail("invalid", `Keep the note under ${MAX_ISSUE_RESOLUTION} characters.`);
  }
  const [issue] = await db
    .update(issues)
    .set({ status: "resolved", resolution: resolution || null, resolvedByUserId: adminUserId, resolvedAt: new Date() })
    .where(and(eq(issues.id, issueId), eq(issues.status, "open")))
    .returning();
  if (!issue) return fail("not_found", "That report isn't open any more.");

  if (issue.reportedByUserId !== adminUserId) {
    const what = describe(issue.title, issue.seasonNumber, issue.episodeNumber);
    await createNotification({
      userId: issue.reportedByUserId,
      mediaType: issue.mediaType,
      tmdbId: issue.tmdbId,
      title: issue.title,
      eventType: "issue_resolved",
      message: resolution ? `The problem you reported with ${what} was fixed: ${resolution}` : `The problem you reported with ${what} was fixed.`,
      relay: false,
    }).catch(() => undefined);
  }
  revalidatePathSafely("/requests");
  return { ok: true };
}

/** "Search again": asks Sonarr/Radarr for another copy of the title the
 * report is about — the usual first fix for a bad file. */
export async function searchAgainForIssue(adminUserId: string, issueId: string): Promise<CoreResult> {
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId)).limit(1);
  if (!issue) return fail("not_found", "Report not found.");
  const title = await getOrFetchTitle(issue.mediaType, issue.tmdbId).catch(() => null);
  return searchTitle(adminUserId, issue.mediaType, issue.tmdbId, title?.tvdbId ?? null);
}

/** A member may withdraw their own open report; the admin any. */
export async function deleteIssue(viewer: { userId: string; isAdmin: boolean }, issueId: string): Promise<CoreResult> {
  const deleted = await db
    .delete(issues)
    .where(
      viewer.isAdmin
        ? eq(issues.id, issueId)
        : and(eq(issues.id, issueId), eq(issues.reportedByUserId, viewer.userId), eq(issues.status, "open")),
    )
    .returning({ id: issues.id });
  if (deleted.length === 0) return fail("not_found", "Report not found.");
  revalidatePathSafely("/requests");
  return { ok: true };
}
