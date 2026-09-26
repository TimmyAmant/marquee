"use server";

import { getViewerContext } from "@/lib/integrations/library-owner";
import {
  createCustomShelf,
  deleteShelf,
  getDiscoverLayout,
  resetDiscoverLayout,
  saveDiscoverLayout,
  updateShelf,
} from "@/lib/discover/layout";
import { lookUpShelfSource } from "@/lib/discover/lookup";
import { isTmdbConfigured } from "@/lib/tmdb/client";
import type { LayoutShelf } from "@/lib/discover/shelves";
import type { DiscoverLookupResult } from "@/lib/api/types";

// Settings → Discover (the admin only): the same calls /api/v1/settings/discover
// makes, for the website's editor.

export type DiscoverActionResult = { shelves?: LayoutShelf[]; error?: string };

const FORBIDDEN = "Only the admin can arrange Discover.";

async function isAdmin(): Promise<boolean> {
  const viewer = await getViewerContext();
  return Boolean(viewer.session && viewer.isAdmin);
}

async function layoutAfter(result: { ok: boolean; error?: string }): Promise<DiscoverActionResult> {
  if (!result.ok) return { error: result.error ?? "Something went wrong." };
  return { shelves: await getDiscoverLayout() };
}

export async function saveDiscoverOrderAction(order: { id: string; hidden: boolean }[]): Promise<DiscoverActionResult> {
  if (!(await isAdmin())) return { error: FORBIDDEN };
  return layoutAfter(await saveDiscoverLayout(order));
}

export async function addDiscoverShelfAction(body: Record<string, unknown>): Promise<DiscoverActionResult> {
  if (!(await isAdmin())) return { error: FORBIDDEN };
  if (body.kind !== "library" && !(await isTmdbConfigured())) {
    return { error: "Connect TMDb in Settings → Integrations first." };
  }
  return layoutAfter(await createCustomShelf(body));
}

export async function updateDiscoverShelfAction(id: string, body: Record<string, unknown>): Promise<DiscoverActionResult> {
  if (!(await isAdmin())) return { error: FORBIDDEN };
  return layoutAfter(await updateShelf(id, body));
}

export async function removeDiscoverShelfAction(id: string): Promise<DiscoverActionResult> {
  if (!(await isAdmin())) return { error: FORBIDDEN };
  return layoutAfter(await deleteShelf(id));
}

export async function resetDiscoverAction(): Promise<DiscoverActionResult> {
  if (!(await isAdmin())) return { error: FORBIDDEN };
  return resetDiscoverLayout();
}

export async function lookUpDiscoverSourceAction(
  type: string,
  query: string,
  mediaType: string | null,
): Promise<{ results?: DiscoverLookupResult[]; error?: string }> {
  if (!(await isAdmin())) return { error: FORBIDDEN };
  try {
    const result = await lookUpShelfSource(type, query, mediaType);
    return result.ok ? { results: result.results } : { error: result.error };
  } catch {
    return { error: "Couldn't search TMDb just now." };
  }
}
