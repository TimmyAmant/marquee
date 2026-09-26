import { asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { ssoSettings, users, type MediaType } from "@/lib/db/schema";
import { fail, type CoreResult } from "@/lib/core-result";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { createNotification } from "@/lib/notifications/query";
import { consumeRateLimit, refundAttempt } from "@/lib/rate-limit";
import {
  cleanShareNote,
  parseRecipients,
  shareMessage,
  SHARES_PER_HOUR,
  type NotificationSender,
} from "@/lib/sharing/parse";

export * from "@/lib/sharing/parse";

// "Share → Send to a household member" on a title page (website, Mac,
// Windows; POST /api/v1/titles/{type}/{id}/share). Every member can share
// with every other one, not only the admin. The recipient gets a
// `title_shared` notification — bell, Web Push and the apps' live stream —
// which is personal, so it's never relayed to the household's Discord,
// ntfy, email and the rest.

/** Everyone a member can share with: the other accounts, by name. Names and
 * photos only — what the share picker shows. */
export async function listShareableUsers(viewerId: string): Promise<NotificationSender[]> {
  return db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUpdatedAt: users.avatarUpdatedAt,
    })
    .from(users)
    .where(ne(users.id, viewerId))
    .orderBy(asc(sql`lower(coalesce(${users.displayName}, ${users.username}))`));
}

/** The account behind a shared-title notification, for the apps' live stream
 * (the list reads it with a join). Null once the account is gone. */
export async function getNotificationSender(userId: string): Promise<NotificationSender | null> {
  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUpdatedAt: users.avatarUpdatedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

/** The address set as Marquee's public one (the single sign-on settings
 * keep it), for links that leave the house; null when none is set, and
 * then the link uses whatever address the sharer has Marquee open on. */
export async function getPublicBaseUrl(): Promise<string | null> {
  const [row] = await db.select({ publicUrl: ssoSettings.publicUrl }).from(ssoSettings).limit(1);
  return row?.publicUrl ? row.publicUrl.replace(/\/+$/, "") : null;
}

export async function shareTitle(
  senderId: string,
  mediaType: MediaType,
  tmdbId: number,
  input: { userIds?: unknown; note?: unknown },
): Promise<CoreResult<{ sharedWith: number }>> {
  const recipients = parseRecipients(input.userIds, senderId);
  if (!recipients.ok) return fail("invalid", recipients.error);
  const note = cleanShareNote(input.note);
  if (!note.ok) return fail("invalid", note.error);

  const found = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, [...recipients.userIds, senderId]));
  const known = new Set(found.map((row) => row.id.toLowerCase()));
  if (!known.has(senderId.toLowerCase())) return fail("unauthorized", "Sign in again.");
  if (!recipients.userIds.every((id) => known.has(id))) {
    return fail("not_found", "Someone you picked isn't in this household any more.");
  }

  const key = `share:${senderId}`;
  if (!consumeRateLimit(key, recipients.userIds.length, SHARES_PER_HOUR, 60 * 60 * 1000)) {
    return fail("rate_limited", "That's a lot of sharing in a short time. Try again in a while.");
  }

  const title = await getOrFetchTitle(mediaType, tmdbId).catch(() => null);
  if (!title) {
    recipients.userIds.forEach(() => refundAttempt(key));
    return fail("upstream", "Couldn't look this title up with TMDb right now.");
  }

  const sender = await getNotificationSender(senderId);
  const message = shareMessage(sender?.displayName || sender?.username || "Someone", title.name, note.note);
  await Promise.all(
    recipients.userIds.map((userId) =>
      createNotification({
        userId,
        mediaType,
        tmdbId,
        title: title.name,
        eventType: "title_shared",
        message,
        relay: false,
        senderUserId: senderId,
        note: note.note,
      }),
    ),
  );
  return { ok: true, sharedWith: recipients.userIds.length };
}
