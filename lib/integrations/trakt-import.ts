import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requests } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import { parseTraktUrl, getListItems, getWatchlistItems } from "@/lib/trakt/client";
import { getTraktClientId } from "@/lib/integrations/app-settings";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { getTitleLibraryStatus } from "@/lib/integrations/status";
import { getActiveRequestStatus } from "@/lib/requests/query";
import { logActivityEvent } from "@/lib/activity/query";
import { fail, type CoreResult } from "@/lib/core-result";

/** Imports a public Trakt list or watchlist as pending requests — reuses the
 * entire existing request/approve pipeline rather than adding a second way
 * to get titles into Sonarr/Radarr. Each importable item becomes a request
 * "from" the admin, same as anyone else's, so Approve/Approve all/Reject
 * all work on it unchanged. Titles already owned/tracked, or already
 * actively requested, are silently skipped rather than double-requested.
 * Shared by the Settings server action and /api/v1; caller must have
 * verified the actor is the admin. */
export async function importTraktList(
  adminUserId: string,
  rawUrl: string,
): Promise<CoreResult<{ importedCount: number; skippedCount: number }>> {
  const url = rawUrl.trim();
  const parsedUrl = parseTraktUrl(url);
  if (!parsedUrl) {
    return fail("invalid", "That doesn't look like a Trakt list or watchlist URL.");
  }

  const clientId = await getTraktClientId();
  if (!clientId) return fail("conflict", "Connect Trakt in Settings first.");

  const items = await (parsedUrl.kind === "watchlist"
    ? getWatchlistItems({ clientId }, parsedUrl.username)
    : getListItems({ clientId }, parsedUrl.username, parsedUrl.slug)
  ).catch(() => null);
  if (!items) {
    return fail("upstream", "Couldn't fetch that list from Trakt — check the URL and that it's set to public.");
  }

  let importedCount = 0;
  let skippedCount = 0;

  for (const item of items) {
    const entity = item.movie ?? item.show;
    const tmdbId = entity?.ids.tmdb;
    if (!entity || !tmdbId) {
      skippedCount++;
      continue;
    }
    const mediaType: MediaType = item.type === "movie" ? "movie" : "tv";

    const existingRequest = await getActiveRequestStatus(adminUserId, mediaType, tmdbId);
    if (existingRequest) {
      skippedCount++;
      continue;
    }

    const cachedTitle = await getOrFetchTitle(mediaType, tmdbId).catch(() => null);
    const currentStatus = await getTitleLibraryStatus(
      adminUserId,
      mediaType,
      tmdbId,
      cachedTitle?.tvdbId ?? null,
    ).catch(() => null);
    if (currentStatus && currentStatus.status !== "untracked") {
      skippedCount++;
      continue;
    }

    const title = cachedTitle?.name ?? entity.title;

    // The same title twice in one list, or a request made while the import
    // runs, trips the one-active-request-per-user unique index. That's a
    // skip, not a reason to abort the rest of the import.
    const inserted = await db
      .insert(requests)
      .values({
        requestedByUserId: adminUserId,
        mediaType,
        tmdbId,
        title,
        posterPath: cachedTitle?.posterPath ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: requests.id });
    if (inserted.length === 0) {
      skippedCount++;
      continue;
    }

    await logActivityEvent({
      actorUserId: adminUserId,
      eventType: "request_created",
      mediaType,
      tmdbId,
      title,
    }).catch(() => undefined);

    importedCount++;
  }

  revalidatePath("/requests");
  return { ok: true, importedCount, skippedCount };
}
