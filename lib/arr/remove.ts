import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { arrStatusCache, requests, type MediaType } from "@/lib/db/schema";
import { fail, type CoreResult } from "@/lib/core-result";
import { getT } from "@/lib/i18n/server";
import { findLibraryCopies } from "@/lib/integrations/status";
import { fourKCopies } from "@/lib/arr/fourk";
import { arrConfig, type ArrServer } from "@/lib/arr/servers";
import * as radarr from "@/lib/radarr/client";
import * as sonarr from "@/lib/sonarr/client";
import { revalidatePathSafely as revalidatePath } from "@/lib/cache/revalidate";

// "Remove from Radarr/Sonarr" on a title page's "…" menu (admin, like
// Seerr's): takes the title off every standard server that has it — or off
// the 4K ones — optionally with its files. The approved requests that added
// it are marked removed (requests.removed_at): they stop counting as open,
// so the title can be requested again, and the can't-find and ready-to-watch
// checks leave them alone. Caller must have verified the actor is the admin.

export type RemoveResult = { removedFrom: string[]; failed: string[]; requestsMarked: number };

export async function removeTitleFromArr(
  adminUserId: string,
  mediaType: MediaType,
  tmdbId: number,
  tvdbId: number | null,
  options: { deleteFiles: boolean; fourK: boolean },
): Promise<CoreResult<RemoveResult>> {
  const t = await getT();
  const copies: { server: ArrServer; arrId: number }[] = options.fourK
    ? await fourKCopies(adminUserId, mediaType, tmdbId, tvdbId).catch(() => [])
    : await findLibraryCopies(adminUserId, mediaType, tmdbId, tvdbId).catch(() => []);
  if (copies.length === 0) return fail("conflict", t("notify.notTracked"));

  const results = await Promise.allSettled(
    copies.map((copy) =>
      mediaType === "movie"
        ? radarr.deleteMovie(arrConfig(copy.server), copy.arrId, options.deleteFiles)
        : sonarr.deleteSeries(arrConfig(copy.server), copy.arrId, options.deleteFiles),
    ),
  );
  const removedFrom = copies.filter((_, i) => results[i].status === "fulfilled").map((c) => c.server.name);
  const failed = copies.filter((_, i) => results[i].status === "rejected").map((c) => c.server.name);
  for (const [i, result] of results.entries()) {
    if (result.status === "rejected") {
      console.error("[arr-remove] %s didn't remove %s %d:", copies[i].server.name, mediaType, tmdbId, result.reason);
    }
  }
  if (removedFrom.length === 0) {
    return fail("upstream", t("notify.removeFromArrFailed", { server: failed[0] ?? "" }));
  }

  if (!options.fourK && failed.length === 0) {
    // The library cache forgets it now rather than at the next sync.
    await db
      .delete(arrStatusCache)
      .where(
        and(
          eq(arrStatusCache.userId, adminUserId),
          eq(arrStatusCache.provider, mediaType === "movie" ? "radarr" : "sonarr"),
          eq(arrStatusCache.externalId, tmdbId),
        ),
      )
      .catch((err) => console.error("[arr-remove] cache cleanup failed:", err));
  }

  const now = new Date();
  const marked = await db
    .update(requests)
    .set({ removedAt: now, notFoundSince: null, notFoundDismissedAt: now })
    .where(
      and(
        eq(requests.mediaType, mediaType),
        eq(requests.tmdbId, tmdbId),
        eq(requests.is4k, options.fourK),
        eq(requests.status, "approved"),
        isNull(requests.removedAt),
      ),
    )
    .returning({ id: requests.id });

  console.info(
    `[arr-remove] removed ${mediaType} ${tmdbId} from ${removedFrom.join(", ")}${options.deleteFiles ? " with its files" : ""}; ${marked.length} request(s) marked removed`,
  );
  revalidatePath(`/title/${mediaType}/${tmdbId}`);
  revalidatePath("/requests");
  revalidatePath("/discover");
  return { ok: true, removedFrom, failed, requestsMarked: marked.length };
}
