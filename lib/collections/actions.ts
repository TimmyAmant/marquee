"use server";

import { getViewerContext } from "@/lib/integrations/library-owner";
import { addCollectionRest, collectionRest, type CollectionRest } from "@/lib/collections/rest";
import { getT } from "@/lib/i18n/server";

function validId(tmdbId: number): boolean {
  return Number.isSafeInteger(tmdbId) && tmdbId > 0;
}

/** After a movie's Add or Request: the rest of its collection, if any. */
export async function collectionRestAction(tmdbId: number): Promise<CollectionRest | null> {
  const viewer = await getViewerContext();
  if (!viewer.session || !validId(tmdbId)) return null;
  return collectionRest(viewer, tmdbId).catch(() => null);
}

/** The collection prompt's "Add them too" / "Request them too". */
export async function addCollectionRestAction(tmdbId: number): Promise<{ error?: string; message?: string }> {
  const viewer = await getViewerContext();
  const t = await getT();
  if (!viewer.session) return { error: t("title.signInToAdd") };
  if (!validId(tmdbId)) return { error: t("notify.notInCollection") };
  const result = await addCollectionRest(viewer, tmdbId).catch(() => null);
  if (!result) return { error: t("common.somethingWentWrong") };
  return result.ok ? { message: result.message } : { error: result.error };
}
