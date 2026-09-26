import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { issues, users, type IssueKind, type MediaType } from "@/lib/db/schema";
import {
  ISSUE_KIND_LABELS,
  issueEpisodeLabel,
  MAX_ISSUE_RESOLUTION,
  MAX_OPEN_ISSUES_PER_USER,
  parseReport,
  type ReportInput,
} from "@/lib/issues/labels";

export { ISSUE_KIND_LABELS, issueEpisodeLabel, parseReport, type ReportInput };
import { fail, type CoreResult } from "@/lib/core-result";
import { getAdminUserId } from "@/lib/auth/get-admin";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { createNotification } from "@/lib/notifications/query";
import { searchTitle } from "@/lib/arr/title-actions";
import { searchFourK } from "@/lib/arr/fourk";
import { checkRateLimit } from "@/lib/rate-limit";

/** Reports one person may send in an hour. */
const REPORTS_PER_HOUR = 10;
import { revalidatePathSafely } from "@/lib/cache/revalidate";

// "Report a problem" (the title page), and the admin's side of it on the
// Requests page: see what's wrong, have Sonarr/Radarr look for a better
// copy, and mark it fixed — the reporter is told either way.

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
  // Counted per report sent, not per report still open: withdrawing and
  // re-sending would otherwise post to every notification channel without end.
  if (!checkRateLimit(`issue-report:${userId}`, REPORTS_PER_HOUR, 60 * 60 * 1000)) {
    return fail("rate_limited", "That's a lot of reports in a short time. Try again in a while.");
  }

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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveIssue(
  adminUserId: string,
  issueId: string,
  note: unknown,
): Promise<CoreResult> {
  if (!UUID.test(issueId)) return fail("not_found", "That report isn't open any more.");
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
export async function searchAgainForIssue(reviewerUserId: string, issueId: string): Promise<CoreResult> {
  if (!UUID.test(issueId)) return fail("not_found", "Report not found.");
  // A trusted member has no Sonarr/Radarr of their own: search with the admin's.
  const [reviewer] = await db.select({ role: users.role }).from(users).where(eq(users.id, reviewerUserId)).limit(1);
  const adminUserId = reviewer?.role === "admin" ? reviewerUserId : await getAdminUserId();
  if (!adminUserId) return fail("conflict", "There's no admin account to search with.");
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId)).limit(1);
  if (!issue) return fail("not_found", "Report not found.");
  const title = await getOrFetchTitle(issue.mediaType, issue.tmdbId).catch(() => null);
  const tvdbId = title?.tvdbId ?? null;
  const main = await searchTitle(adminUserId, issue.mediaType, issue.tmdbId, tvdbId);
  // A title only the 4K server has: the report is about that copy.
  if (!main.ok && main.code === "conflict") {
    const fourK = await searchFourK(adminUserId, issue.mediaType, issue.tmdbId, tvdbId);
    if (fourK) return fourK;
  }
  return main;
}

/** A member may withdraw their own open report; the admin any. */
export async function deleteIssue(viewer: { userId: string; isAdmin: boolean }, issueId: string): Promise<CoreResult> {
  if (!UUID.test(issueId)) return fail("not_found", "Report not found.");
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
