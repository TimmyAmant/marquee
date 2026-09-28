"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/require-admin";
import type { MediaType } from "@/lib/db/schema";
import {
  blockByRule,
  blockKeyword,
  blockTitle,
  parseBlockRule,
  previewBlockRule,
  removeBlocklistEntry,
  unblockTitle,
  type BlockPreview,
} from "@/lib/requests/blocklist";
import { getT } from "@/lib/i18n/server";

// The website's blocklist controls — the title page's Block / Unblock and
// Settings' list — over lib/requests/blocklist.ts, like /api/v1's.

export type BlocklistActionState = { error?: string; success?: boolean };

const FORBIDDEN = "notify.onlyAdminBlocklist" as const;

function validTitle(mediaType: unknown, tmdbId: unknown): mediaType is MediaType {
  return (mediaType === "movie" || mediaType === "tv") && Number.isSafeInteger(tmdbId) && (tmdbId as number) > 0;
}

export async function blockTitleAction(mediaType: MediaType, tmdbId: number, reason: string): Promise<BlocklistActionState> {
  const admin = await requirePermission("manageBlocklist", (await getT())(FORBIDDEN));
  if (!admin.ok) return { error: admin.error };
  if (!validTitle(mediaType, tmdbId)) return { error: (await getT())("notify.titleNotFound") };
  const result = await blockTitle(mediaType, tmdbId, reason);
  return result.ok ? { success: true } : { error: result.error };
}

export async function unblockTitleAction(mediaType: MediaType, tmdbId: number): Promise<BlocklistActionState> {
  const admin = await requirePermission("manageBlocklist", (await getT())(FORBIDDEN));
  if (!admin.ok) return { error: admin.error };
  if (!validTitle(mediaType, tmdbId)) return { error: (await getT())("notify.titleNotFound") };
  const result = await unblockTitle(mediaType, tmdbId);
  return result.ok ? { success: true } : { error: result.error };
}

export async function blockKeywordAction(_prev: BlocklistActionState | undefined, formData: FormData): Promise<BlocklistActionState> {
  const admin = await requirePermission("manageBlocklist", (await getT())(FORBIDDEN));
  if (!admin.ok) return { error: admin.error };
  const result = await blockKeyword(formData.get("keyword"), formData.get("reason"));
  if (!result.ok) return { error: result.error };
  revalidatePath("/settings", "layout");
  return { success: true };
}

export async function removeBlocklistEntryAction(id: string): Promise<BlocklistActionState> {
  const admin = await requirePermission("manageBlocklist", (await getT())(FORBIDDEN));
  if (!admin.ok) return { error: admin.error };
  const result = await removeBlocklistEntry(id);
  if (!result.ok) return { error: result.error };
  revalidatePath("/settings", "layout");
  return { success: true };
}

/** Settings › Blocklist's automatic rules: a keyword or genre, a rating in
 * a country, or adult titles (lib/requests/blocklist.ts). */
export async function blockRuleAction(body: Record<string, unknown>): Promise<BlocklistActionState> {
  const admin = await requirePermission("manageBlocklist", (await getT())(FORBIDDEN));
  if (!admin.ok) return { error: admin.error };
  const parsed = await parseBlockRule(body && typeof body === "object" ? body : {});
  if (!parsed.ok) return { error: parsed.error };
  const result = await blockByRule(parsed.rule, body.reason);
  if (!result.ok) return { error: result.error };
  revalidatePath("/settings", "layout");
  return { success: true };
}

/** What that rule would block, before it's added. */
export async function previewBlockRuleAction(
  body: Record<string, unknown>,
): Promise<{ preview?: BlockPreview; error?: string }> {
  const admin = await requirePermission("manageBlocklist", (await getT())(FORBIDDEN));
  if (!admin.ok) return { error: admin.error };
  const parsed = await parseBlockRule(body && typeof body === "object" ? body : {});
  if (!parsed.ok) return { error: parsed.error };
  return { preview: await previewBlockRule(parsed.rule) };
}
