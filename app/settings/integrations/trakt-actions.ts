"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requests } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import {
  verifyTraktClientId,
  parseTraktUrl,
  getListItems,
  getWatchlistItems,
} from "@/lib/trakt/client";
import {
  getTraktClientId,
  setTraktClientId,
  clearTraktClientId,
} from "@/lib/integrations/app-settings";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { getTitleLibraryStatus } from "@/lib/integrations/status";
import { getActiveRequestStatus } from "@/lib/requests/query";
import { logActivityEvent } from "@/lib/activity/query";
import { requireAdmin } from "@/lib/auth/require-admin";

export type TraktSettingsState = { error?: string; success?: boolean };

export async function testAndSaveTraktClientId(
  _prevState: TraktSettingsState | undefined,
  formData: FormData,
): Promise<TraktSettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  const clientId = String(formData.get("clientId") || "").trim();
  if (!clientId) return { error: "Enter a Trakt client id." };

  const valid = await verifyTraktClientId(clientId).catch(() => false);
  if (!valid) return { error: "Couldn't verify this client id with Trakt. Check it and try again." };

  await setTraktClientId(clientId);
  revalidatePath("/settings/integrations");
  return { success: true };
}

export async function disconnectTrakt(
  _prevState: TraktSettingsState | undefined,
): Promise<TraktSettingsState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  await clearTraktClientId();
  revalidatePath("/settings/integrations");
  return { success: true };
}

export type TraktImportState = {
  error?: string;
  success?: boolean;
  importedCount?: number;
  skippedCount?: number;
};

/** Imports a public Trakt list or watchlist as pending requests — reuses the
 * entire existing request/approve pipeline rather than adding a second way
 * to get titles into Sonarr/Radarr. Each importable item becomes a request
 * "from" the admin, same as anyone else's, so Approve/Approve all/Reject
 * all work on it unchanged. Titles already owned/tracked, or already
 * actively requested, are silently skipped rather than double-requested. */
export async function importTraktListAction(
  _prevState: TraktImportState | undefined,
  formData: FormData,
): Promise<TraktImportState> {
  const admin = await requireAdmin("Only the admin can import from Trakt.");
  if (!admin.ok) return { error: admin.error };

  const url = String(formData.get("url") || "").trim();
  const parsedUrl = parseTraktUrl(url);
  if (!parsedUrl) {
    return { error: "That doesn't look like a Trakt list or watchlist URL." };
  }

  const clientId = await getTraktClientId();
  if (!clientId) return { error: "Connect Trakt in Settings first." };

  const items = await (parsedUrl.kind === "watchlist"
    ? getWatchlistItems({ clientId }, parsedUrl.username)
    : getListItems({ clientId }, parsedUrl.username, parsedUrl.slug)
  ).catch(() => null);
  if (!items) {
    return { error: "Couldn't fetch that list from Trakt — check the URL and that it's set to public." };
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

    const existingRequest = await getActiveRequestStatus(admin.userId, mediaType, tmdbId);
    if (existingRequest) {
      skippedCount++;
      continue;
    }

    const cachedTitle = await getOrFetchTitle(mediaType, tmdbId).catch(() => null);
    const currentStatus = await getTitleLibraryStatus(
      admin.userId,
      mediaType,
      tmdbId,
      cachedTitle?.tvdbId ?? null,
    ).catch(() => null);
    if (currentStatus && currentStatus.status !== "untracked") {
      skippedCount++;
      continue;
    }

    const title = cachedTitle?.name ?? entity.title;

    await db.insert(requests).values({
      requestedByUserId: admin.userId,
      mediaType,
      tmdbId,
      title,
      posterPath: cachedTitle?.posterPath ?? null,
    });

    await logActivityEvent({
      actorUserId: admin.userId,
      eventType: "request_created",
      mediaType,
      tmdbId,
      title,
    }).catch(() => undefined);

    importedCount++;
  }

  revalidatePath("/requests");
  return { success: true, importedCount, skippedCount };
}
