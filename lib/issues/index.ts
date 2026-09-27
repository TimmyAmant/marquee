import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { issues, users, type IssueKind, type MediaType } from "@/lib/db/schema";
import {
  issueKindLabel,
  issueEpisodeLabel,
  MAX_ISSUE_RESOLUTION,
  MAX_OPEN_ISSUES_PER_USER,
  parseReport,
  type ReportInput,
} from "@/lib/issues/labels";

export { issueKindLabel, issueEpisodeLabel, parseReport, type ReportInput };
import { getT } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n/translator";
import { fail, type CoreResult } from "@/lib/core-result";
import { getAdminUserId } from "@/lib/auth/get-admin";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { createNotification } from "@/lib/notifications/query";
import { searchTitle } from "@/lib/arr/title-actions";
import { searchFourK } from "@/lib/arr/fourk";
import { checkRateLimit } from "@/lib/rate-limit";
import { can } from "@/lib/users/permissions";
import { getAccess } from "@/lib/users/access";

/** Reports one person may send in an hour. */
const REPORTS_PER_HOUR = 10;
import { revalidatePathSafely } from "@/lib/cache/revalidate";

// "Report a problem" (the title page), and the admin's side of it on the
// Requests page: see what's wrong, have Sonarr/Radarr look for a better
// copy, and mark it fixed — the reporter is told either way.

/** `"Dune"`, or `"Dune" (S2 E5)`: how notifications name a report's title. */
function describe(t: Translator, title: string, seasonNumber: number | null, episodeNumber: number | null): string {
  const episode = issueEpisodeLabel(t, seasonNumber, episodeNumber);
  return episode ? t("notify.quotedTitleWithDetail", { title, detail: episode }) : t("notify.quotedTitle", { title });
}

export async function reportIssue(
  userId: string,
  mediaType: MediaType,
  tmdbId: number,
  input: ReportInput,
): Promise<CoreResult<{ issueId: string }>> {
  const t = await getT();
  if (!can(await getAccess(userId), "reportIssues")) {
    return fail("forbidden", t("notify.reportingNotAllowed"));
  }
  const parsed = parseReport(t, mediaType, input);
  if (!parsed.ok) return fail("invalid", parsed.error);
  // Counted per report sent, not per report still open: withdrawing and
  // re-sending would otherwise post to every notification channel without end.
  if (!checkRateLimit(`issue-report:${userId}`, REPORTS_PER_HOUR, 60 * 60 * 1000)) {
    return fail("rate_limited", t("notify.reportRateLimited"));
  }

  const [open] = await db
    .select({ count: count() })
    .from(issues)
    .where(and(eq(issues.reportedByUserId, userId), eq(issues.status, "open")));
  if ((open?.count ?? 0) >= MAX_OPEN_ISSUES_PER_USER) {
    return fail("rate_limited", t("notify.reportTooManyOpen"));
  }

  const title = await getOrFetchTitle(mediaType, tmdbId).catch(() => null);
  if (!title) return fail("upstream", t("notify.tmdbLookupFailed"));

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
      // The admin's language here, and the household's on its channels.
      message: (rt) =>
        rt("notify.issueReported", {
          who: reporter?.name || reporter?.username || rt("notify.someone"),
          title: describe(rt, title.name, parsed.seasonNumber, parsed.episodeNumber),
          kind: issueKindLabel(rt, parsed.kind),
        }),
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

/** Whoever handles problem reports (the manageIssues permission) sees every
 * open report and the latest fixed ones; anyone else only their own. Newest
 * first. */
export async function listIssues(viewer: { userId: string; managesIssues: boolean }): Promise<IssueRow[]> {
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
  if (!viewer.managesIssues) {
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
  const t = await getT();
  if (!UUID.test(issueId)) return fail("not_found", t("notify.reportNotOpen"));
  const resolution = typeof note === "string" ? note.trim() : "";
  if (resolution.length > MAX_ISSUE_RESOLUTION) {
    return fail("invalid", t("notify.noteTooLong", { count: MAX_ISSUE_RESOLUTION }));
  }
  const [issue] = await db
    .update(issues)
    .set({ status: "resolved", resolution: resolution || null, resolvedByUserId: adminUserId, resolvedAt: new Date() })
    .where(and(eq(issues.id, issueId), eq(issues.status, "open")))
    .returning();
  if (!issue) return fail("not_found", t("notify.reportNotOpen"));

  if (issue.reportedByUserId !== adminUserId) {
    await createNotification({
      userId: issue.reportedByUserId,
      mediaType: issue.mediaType,
      tmdbId: issue.tmdbId,
      title: issue.title,
      eventType: "issue_resolved",
      message: (rt) => {
        const what = describe(rt, issue.title, issue.seasonNumber, issue.episodeNumber);
        return resolution
          ? rt("notify.issueFixedWithNote", { title: what, note: resolution })
          : rt("notify.issueFixed", { title: what });
      },
      // The household channels only post this if the admin picked "A
      // reported problem is fixed" for them (off by default, as before).
    }).catch(() => undefined);
  }
  revalidatePathSafely("/requests");
  return { ok: true };
}

/** "Search again": asks Sonarr/Radarr for another copy of the title the
 * report is about — the usual first fix for a bad file. */
export async function searchAgainForIssue(reviewerUserId: string, issueId: string): Promise<CoreResult> {
  const t = await getT();
  if (!UUID.test(issueId)) return fail("not_found", t("notify.reportNotFound"));
  // A trusted member has no Sonarr/Radarr of their own: search with the admin's.
  const [reviewer] = await db.select({ role: users.role }).from(users).where(eq(users.id, reviewerUserId)).limit(1);
  const adminUserId = reviewer?.role === "admin" ? reviewerUserId : await getAdminUserId();
  if (!adminUserId) return fail("conflict", t("notify.noAdminToSearch"));
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId)).limit(1);
  if (!issue) return fail("not_found", t("notify.reportNotFound"));
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

/** Anyone may withdraw their own open report; whoever handles problem
 * reports may remove any. */
export async function deleteIssue(viewer: { userId: string; managesIssues: boolean }, issueId: string): Promise<CoreResult> {
  if (!UUID.test(issueId)) return fail("not_found", (await getT())("notify.reportNotFound"));
  const deleted = await db
    .delete(issues)
    .where(
      viewer.managesIssues
        ? eq(issues.id, issueId)
        : and(eq(issues.id, issueId), eq(issues.reportedByUserId, viewer.userId), eq(issues.status, "open")),
    )
    .returning({ id: issues.id });
  if (deleted.length === 0) return fail("not_found", (await getT())("notify.reportNotFound"));
  revalidatePathSafely("/requests");
  return { ok: true };
}
