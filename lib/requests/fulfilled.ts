import { and, eq, gte, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications, requests } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import { createNotification } from "@/lib/notifications/query";

/**
 * Tells everyone who asked for this title that it has arrived. Called when
 * Radarr/Sonarr report a finished download: the webhook itself only knows
 * about the admin whose URL it is, so without this the person who actually
 * requested the title never hears that it's ready.
 *
 * Sonarr sends one Download event per episode, so a requester is told once
 * per request — a "downloaded" notification already sent to them for this
 * title since they asked for it means there's nothing new to say.
 */
export async function notifyRequestersOfDownload(input: {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  /** Already notified by the webhook itself. */
  exceptUserId: string;
}): Promise<void> {
  const open = await db
    .select({ userId: requests.requestedByUserId, createdAt: requests.createdAt })
    .from(requests)
    .where(
      and(
        eq(requests.mediaType, input.mediaType),
        eq(requests.tmdbId, input.tmdbId),
        inArray(requests.status, ["pending", "approved"]),
        ne(requests.requestedByUserId, input.exceptUserId),
      ),
    );

  const earliestByUser = new Map<string, Date>();
  for (const row of open) {
    const seen = earliestByUser.get(row.userId);
    if (!seen || row.createdAt < seen) earliestByUser.set(row.userId, row.createdAt);
  }

  for (const [userId, since] of earliestByUser) {
    const [already] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.mediaType, input.mediaType),
          eq(notifications.tmdbId, input.tmdbId),
          eq(notifications.eventType, "downloaded"),
          gte(notifications.createdAt, since),
        ),
      )
      .limit(1);
    if (already) continue;

    await createNotification({
      userId,
      mediaType: input.mediaType,
      tmdbId: input.tmdbId,
      title: input.title,
      eventType: "downloaded",
      message:
        input.mediaType === "movie"
          ? `${input.title}, which you requested, is ready to watch`
          : `${input.title}, which you requested, has new episodes ready to watch`,
      relay: false,
    });
  }
}
