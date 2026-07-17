"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { arrStatusCache } from "@/lib/db/schema";
import { getArrCredential } from "@/lib/integrations/credentials";
import { requireAdmin } from "@/lib/auth/require-admin";
import * as sonarr from "@/lib/sonarr/client";
import * as radarr from "@/lib/radarr/client";

export type UnmonitorState = { error?: string; success?: boolean };

export async function unmonitorTitle(
  mediaType: "movie" | "tv",
  tmdbId: number,
  _prevState: UnmonitorState | undefined,
  _formData: FormData,
): Promise<UnmonitorState> {
  const admin = await requireAdmin("Only the admin can change monitoring.");
  if (!admin.ok) return { error: admin.error };
  const userId = admin.userId;

  const provider = mediaType === "movie" ? "radarr" : "sonarr";
  const credential = await getArrCredential(userId, provider);
  if (!credential) return { error: `Connect ${provider} first.` };

  const [row] = await db
    .select({ arrId: arrStatusCache.arrId })
    .from(arrStatusCache)
    .where(
      and(
        eq(arrStatusCache.userId, userId),
        eq(arrStatusCache.provider, provider),
        eq(arrStatusCache.externalId, tmdbId),
      ),
    )
    .limit(1);

  if (!row?.arrId) return { error: "Couldn't find this title in your library." };

  const config = { baseUrl: credential.baseUrl, apiKey: credential.apiKey };

  try {
    if (mediaType === "movie") {
      await radarr.setMovieMonitored(config, row.arrId, false);
    } else {
      await sonarr.setSeriesMonitored(config, row.arrId, false);
    }
  } catch {
    return { error: "Couldn't update monitoring status." };
  }

  await db
    .update(arrStatusCache)
    .set({ monitored: false, status: "untracked", checkedAt: new Date() })
    .where(
      and(
        eq(arrStatusCache.userId, userId),
        eq(arrStatusCache.provider, provider),
        eq(arrStatusCache.externalId, tmdbId),
      ),
    );

  revalidatePath(`/title/${mediaType}/${tmdbId}`);
  revalidatePath("/discover");
  revalidatePath("/library");
  return { success: true };
}
