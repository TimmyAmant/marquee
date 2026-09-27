import { and, asc, count, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { comments, issues, requests, users, type MediaType } from "@/lib/db/schema";
import { fail, type CoreResult } from "@/lib/core-result";
import { can, type Permission, type PermissionSubject } from "@/lib/users/permissions";
import { usersWhoCan } from "@/lib/users/access";
import { avatarPath } from "@/lib/users/avatar-path";
import { checkRateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications/query";
import { quotedRequestTitle } from "@/lib/requests/labels";
import { issueEpisodeLabel } from "@/lib/issues/labels";
import { getT } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n/translator";
import {
  canDeleteComment,
  canEditComment,
  commentSnippet,
  COMMENT_WINDOW_MS,
  COMMENTS_PER_WINDOW,
  editableUntil,
  MAX_COMMENT_LENGTH,
  MAX_COMMENTS_PER_THREAD,
  sanitizeComment,
} from "@/lib/comments/text";
import type { Comment, CommentAuthor, CommentThread } from "@/lib/api/types";

// A conversation on a request or a problem report, between whoever asked
// (or reported) and the reviewers — the admin and trusted members. Nobody
// else can see a thread or learn that it exists: to them it's "not found".
// Shared by the website's server actions (lib/comments/actions.ts) and
// /api/v1/{requests,issues}/{id}/comments.

export type CommentTarget = { kind: "request" | "issue"; id: string };
export type CommentViewer = PermissionSubject & { userId: string };

/** Who works a thread besides its owner: whoever reviews requests, or
 * handles problem reports (lib/users/permissions.ts). */
function threadPermission(kind: CommentTarget["kind"]): Permission {
  return kind === "request" ? "reviewRequests" : "manageIssues";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = { request: "notify.requestNotFound", issue: "notify.reportNotFound" } as const;

type Note = { kind: Comment["kind"]; authorId: string | null; body: string; at: Date };

/** What a thread hangs off: whose it is, what it's about, and what was
 * already said before comments existed. */
type Parent = {
  ownerId: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  /** The comment notification, in its reader's language: `Anna commented
   * on "Dune" (Season 2): …`, `… on the problem with "Dune" (S2 E5): …`. */
  notice: (t: Translator, who: string, snippet: string) => string;
  /** Reviewers already involved: whoever reviewed the request or fixed the report. */
  reviewerIds: string[];
  notes: Note[];
};

async function loadParent(target: CommentTarget): Promise<Parent | null> {
  if (!UUID.test(target.id)) return null;
  if (target.kind === "request") {
    const [row] = await db.select().from(requests).where(eq(requests.id, target.id)).limit(1);
    if (!row) return null;
    return {
      ownerId: row.requestedByUserId,
      mediaType: row.mediaType,
      tmdbId: row.tmdbId,
      title: row.title,
      notice: (t, who, snippet) => {
        const quoted = quotedRequestTitle(t, row.title, row.seasons);
        return t("notify.commentOnRequest", {
          who,
          request: row.is4k ? t("notify.requestIn4k", { request: quoted }) : quoted,
          snippet,
        });
      },
      reviewerIds: row.reviewedByUserId ? [row.reviewedByUserId] : [],
      notes:
        row.status === "rejected" && row.rejectionReason && row.reviewedAt
          ? [{ kind: "declined", authorId: row.reviewedByUserId, body: row.rejectionReason, at: row.reviewedAt }]
          : [],
    };
  }
  const [row] = await db.select().from(issues).where(eq(issues.id, target.id)).limit(1);
  if (!row) return null;
  const notes: Note[] = [];
  if (row.message) notes.push({ kind: "report", authorId: row.reportedByUserId, body: row.message, at: row.createdAt });
  if (row.resolution && row.resolvedAt) {
    notes.push({ kind: "resolution", authorId: row.resolvedByUserId, body: row.resolution, at: row.resolvedAt });
  }
  return {
    ownerId: row.reportedByUserId,
    mediaType: row.mediaType,
    tmdbId: row.tmdbId,
    title: row.title,
    notice: (t, who, snippet) => {
      const episode = issueEpisodeLabel(t, row.seasonNumber, row.episodeNumber);
      return episode
        ? t("notify.commentOnIssueEpisode", { who, title: row.title, episode, snippet })
        : t("notify.commentOnIssue", { who, title: row.title, snippet });
    },
    reviewerIds: row.resolvedByUserId ? [row.resolvedByUserId] : [],
    notes,
  };
}

/** The requester or reporter, and reviewers. Pure. */
export function canSeeThread(viewer: CommentViewer, ownerId: string, kind: CommentTarget["kind"]): boolean {
  return viewer.userId === ownerId || can(viewer, threadPermission(kind));
}

/** The parent, if this viewer may see its thread; "not found" otherwise, so
 * a thread someone can't see is indistinguishable from one that isn't there. */
async function openThread(viewer: CommentViewer, target: CommentTarget): Promise<CoreResult<{ parent: Parent }>> {
  const parent = await loadParent(target);
  if (!parent || !canSeeThread(viewer, parent.ownerId, target.kind)) return fail("not_found", (await getT())(NOT_FOUND[target.kind]));
  return { ok: true, parent };
}

function parentColumn(target: CommentTarget) {
  return target.kind === "request" ? eq(comments.requestId, target.id) : eq(comments.issueId, target.id);
}

type AuthorRow = {
  id: string;
  displayName: string | null;
  username: string;
  role: string;
  permissions: string[];
  avatarUpdatedAt: Date | null;
};

function authorDto(user: AuthorRow | undefined, avatarBase: "/api" | "/api/v1", t: Translator): CommentAuthor {
  if (!user) return { userId: null, label: t("notify.someone"), avatarUrl: null, role: null };
  return {
    userId: user.id,
    label: user.displayName || user.username,
    avatarUrl: avatarPath(user, avatarBase),
    role: user.role === "admin" ? "admin" : can(user, "reviewRequests") || can(user, "manageIssues") ? "reviewer" : "member",
  };
}

/** The thread, oldest first: the notes that were already there, then comments. */
export async function listComments(
  viewer: CommentViewer,
  target: CommentTarget,
  avatarBase: "/api" | "/api/v1" = "/api/v1",
  now = new Date(),
): Promise<CoreResult<{ thread: CommentThread }>> {
  const opened = await openThread(viewer, target);
  if (!opened.ok) return opened;
  const { parent } = opened;
  const rows = await db.select().from(comments).where(parentColumn(target)).orderBy(asc(comments.createdAt));

  const authorIds = [
    ...new Set([...rows.map((r) => r.authorUserId), ...parent.notes.flatMap((n) => (n.authorId ? [n.authorId] : []))]),
  ];
  const authors =
    authorIds.length === 0
      ? []
      : await db
          .select({
            id: users.id,
            displayName: users.displayName,
            username: users.username,
            role: users.role,
            permissions: users.permissions,
            avatarUpdatedAt: users.avatarUpdatedAt,
          })
          .from(users)
          .where(inArray(users.id, authorIds));
  const byId = new Map(authors.map((a) => [a.id, a]));
  const t = await getT();

  const notes: Comment[] = parent.notes.map((note) => ({
    id: `${note.kind}:${target.id}`,
    kind: note.kind,
    author: authorDto(note.authorId ? byId.get(note.authorId) : undefined, avatarBase, t),
    body: note.body,
    createdAt: note.at.toISOString(),
    editedAt: null,
    isMine: note.authorId === viewer.userId,
    canEdit: false,
    canDelete: false,
    editableUntil: null,
  }));
  const posted: Comment[] = rows.map((row) => {
    const canEdit = canEditComment(row, viewer.userId, now);
    return {
      id: row.id,
      kind: "comment",
      author: authorDto(byId.get(row.authorUserId), avatarBase, t),
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      editedAt: row.editedAt?.toISOString() ?? null,
      isMine: row.authorUserId === viewer.userId,
      canEdit,
      canDelete: canDeleteComment(row, viewer, now),
      editableUntil: row.authorUserId === viewer.userId ? editableUntil(row.createdAt).toISOString() : null,
    };
  });
  const results = [...notes, ...posted].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { ok: true, thread: { results, canComment: true, maxLength: MAX_COMMENT_LENGTH } };
}

/** Comment counts for many requests or reports at once (the Requests page
 * shows "2 comments" on a row before it's opened). Only call it with ids the
 * viewer may already see. */
export async function countComments(kind: CommentTarget["kind"], ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  const column = kind === "request" ? comments.requestId : comments.issueId;
  const rows = await db
    .select({ parentId: column, count: count() })
    .from(comments)
    .where(inArray(column, ids))
    .groupBy(column);
  for (const row of rows) if (row.parentId) map.set(row.parentId, row.count);
  return map;
}

export async function addComment(
  viewer: CommentViewer,
  target: CommentTarget,
  rawBody: unknown,
  /** False for a line the server writes on someone's behalf ("Changed this
   * request to Season 2."), which their own typing shouldn't hold back. */
  rateLimited = true,
): Promise<CoreResult<{ commentId: string }>> {
  const opened = await openThread(viewer, target);
  if (!opened.ok) return opened;
  const { parent } = opened;
  const t = await getT();
  const parsed = sanitizeComment(rawBody, t);
  if (!parsed.ok) return fail("invalid", parsed.error);
  if (rateLimited && !checkRateLimit(`comment:${viewer.userId}`, COMMENTS_PER_WINDOW, COMMENT_WINDOW_MS)) {
    return fail("rate_limited", t("notify.commentRateLimited"));
  }
  const [existing] = await db.select({ count: count() }).from(comments).where(parentColumn(target));
  if ((existing?.count ?? 0) >= MAX_COMMENTS_PER_THREAD) {
    return fail("conflict", t("notify.commentThreadFull"));
  }

  const [row] = await db
    .insert(comments)
    .values({
      requestId: target.kind === "request" ? target.id : null,
      issueId: target.kind === "issue" ? target.id : null,
      authorUserId: viewer.userId,
      body: parsed.body,
    })
    .returning({ id: comments.id })
    // The request or report went away between the check and the insert.
    .catch((err) => {
      if (err && typeof err === "object" && "code" in err && err.code === "23503") return [];
      throw err;
    });
  if (!row) return fail("not_found", t(NOT_FOUND[target.kind]));

  await notifyThread(viewer.userId, target, parent, parsed.body).catch(() => undefined);
  return { ok: true, commentId: row.id };
}

/** Who hears about a new comment: everyone in the conversation but its
 * author — the requester or reporter, and each reviewer who's already
 * involved (commented, reviewed the request or fixed the report). When the
 * requester writes and no reviewer is involved yet, every reviewer hears it,
 * so it doesn't go unread. Only people who can still see the thread; never
 * the household channels. Pure over its inputs; unit tested. */
export function commentRecipients(input: {
  authorId: string;
  ownerId: string;
  involvedIds: string[];
  reviewerIds: string[];
}): string[] {
  const reviewers = new Set(input.reviewerIds);
  const involved = input.involvedIds.filter((id) => reviewers.has(id));
  const recipients = new Set<string>([input.ownerId]);
  if (involved.length > 0) for (const id of involved) recipients.add(id);
  else if (input.authorId === input.ownerId) for (const id of reviewers) recipients.add(id);
  recipients.delete(input.authorId);
  return [...recipients];
}

async function notifyThread(authorId: string, target: CommentTarget, parent: Parent, body: string): Promise<void> {
  const [reviewerRows, commenterRows, [author]] = await Promise.all([
    usersWhoCan(threadPermission(target.kind)),
    db
      .selectDistinct({ id: comments.authorUserId })
      .from(comments)
      .where(and(parentColumn(target), isNotNull(comments.authorUserId))),
    db.select({ name: users.displayName, username: users.username }).from(users).where(eq(users.id, authorId)).limit(1),
  ]);
  const recipients = commentRecipients({
    authorId,
    ownerId: parent.ownerId,
    involvedIds: [...parent.reviewerIds, ...commenterRows.map((r) => r.id)],
    reviewerIds: reviewerRows.map((r) => r.id),
  });
  const who = author?.name || author?.username || null;
  const snippet = commentSnippet(body);
  // In each recipient's own language.
  const message = (t: Translator) => parent.notice(t, who ?? t("notify.someone"), snippet);
  for (const userId of recipients) {
    await createNotification({
      userId,
      mediaType: parent.mediaType,
      tmdbId: parent.tmdbId,
      title: parent.title,
      eventType: target.kind === "request" ? "request_comment" : "issue_comment",
      message,
      ...(target.kind === "request" ? { requestId: target.id } : { issueId: target.id }),
      // Between the people in the conversation: never Discord and the rest.
      relay: false,
    }).catch(() => undefined);
  }
}

/** Finds a comment in the thread it's addressed through, if the viewer may
 * see that thread. */
async function findComment(viewer: CommentViewer, target: CommentTarget, commentId: string) {
  if (!UUID.test(commentId)) return null;
  const opened = await openThread(viewer, target);
  if (!opened.ok) return null;
  const [row] = await db
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), parentColumn(target)))
    .limit(1);
  return row ?? null;
}

export async function editComment(
  viewer: CommentViewer,
  target: CommentTarget,
  commentId: string,
  rawBody: unknown,
  now = new Date(),
): Promise<CoreResult> {
  const t = await getT();
  const row = await findComment(viewer, target, commentId);
  if (!row) return fail("not_found", t("notify.commentNotFound"));
  if (row.authorUserId !== viewer.userId) return fail("forbidden", t("notify.commentEditOwnOnly"));
  if (!canEditComment(row, viewer.userId, now)) {
    return fail("forbidden", t("notify.commentEditWindow"));
  }
  const parsed = sanitizeComment(rawBody, t);
  if (!parsed.ok) return fail("invalid", parsed.error);
  await db
    .update(comments)
    .set({ body: parsed.body, editedAt: now })
    .where(and(eq(comments.id, commentId), eq(comments.authorUserId, viewer.userId)));
  return { ok: true };
}

export async function deleteComment(
  viewer: CommentViewer,
  target: CommentTarget,
  commentId: string,
  now = new Date(),
): Promise<CoreResult> {
  const t = await getT();
  const row = await findComment(viewer, target, commentId);
  if (!row) return fail("not_found", t("notify.commentNotFound"));
  if (!canDeleteComment(row, viewer, now)) {
    return fail(
      "forbidden",
      row.authorUserId === viewer.userId ? t("notify.commentDeleteWindow") : t("notify.commentDeleteOwnOnly"),
    );
  }
  await db.delete(comments).where(eq(comments.id, commentId));
  return { ok: true };
}
