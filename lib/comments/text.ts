// The pure side of comment threads (lib/comments): what a comment may say,
// and how long its author can still change it. Unit tested.

export const MAX_COMMENT_LENGTH = 2000;
/** Comments one person may post in COMMENT_WINDOW_MS, across every thread. */
export const COMMENTS_PER_WINDOW = 12;
export const COMMENT_WINDOW_MS = 10 * 60 * 1000;
/** How long after posting its author may still edit or delete a comment. */
export const COMMENT_EDIT_WINDOW_MS = 15 * 60 * 1000;
/** A thread stops taking comments past this many. */
export const MAX_COMMENTS_PER_THREAD = 300;

// Control characters (but tab and newline), and the invisible direction
// overrides that can make text read differently from what was typed.
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g;

/** Plain text, cleaned: line endings made "\n", control and direction
 * characters dropped, trailing spaces trimmed off each line, at most one
 * blank line in a row, no blank lines at either end. */
export function sanitizeComment(raw: unknown): { ok: true; body: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Write something first." };
  const body = raw
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .split("\n")
    .map((line) => line.replace(/\s+$/u, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (body.length === 0) return { ok: false, error: "Write something first." };
  if (body.length > MAX_COMMENT_LENGTH) {
    return { ok: false, error: `Keep it under ${MAX_COMMENT_LENGTH} characters.` };
  }
  return { ok: true, body };
}

/** Until when its author may still edit or delete it. */
export function editableUntil(createdAt: Date): Date {
  return new Date(createdAt.getTime() + COMMENT_EDIT_WINDOW_MS);
}

/** Its author, within the window, may edit it. */
export function canEditComment(comment: { authorUserId: string; createdAt: Date }, viewerId: string, now: Date): boolean {
  return comment.authorUserId === viewerId && now.getTime() <= editableUntil(comment.createdAt).getTime();
}

/** Its author within the window, or the admin at any time (moderation). */
export function canDeleteComment(
  comment: { authorUserId: string; createdAt: Date },
  viewer: { userId: string; role: string | null | undefined },
  now: Date,
): boolean {
  return viewer.role === "admin" || canEditComment(comment, viewer.userId, now);
}

/** The start of a comment for a notification: one line, cut at a word. */
export function commentSnippet(body: string, max = 90): string {
  const line = body.replace(/\s+/g, " ").trim();
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
