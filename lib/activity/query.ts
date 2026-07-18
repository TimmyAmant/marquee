import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { activityEvents, users } from "@/lib/db/schema";
import type { ActivityEventType, MediaType } from "@/lib/db/schema";

export async function logActivityEvent(event: {
  actorUserId: string;
  eventType: ActivityEventType;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
}): Promise<void> {
  await db.insert(activityEvents).values(event);
}

export async function getRecentActivity(limit = 50) {
  return db
    .select({
      id: activityEvents.id,
      eventType: activityEvents.eventType,
      mediaType: activityEvents.mediaType,
      tmdbId: activityEvents.tmdbId,
      title: activityEvents.title,
      createdAt: activityEvents.createdAt,
      actorName: users.displayName,
      actorUsername: users.username,
    })
    .from(activityEvents)
    .innerJoin(users, eq(users.id, activityEvents.actorUserId))
    .orderBy(desc(activityEvents.createdAt))
    .limit(limit);
}
