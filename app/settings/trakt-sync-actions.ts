"use server";

import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  canUseTraktSync,
  createTraktSync,
  deleteTraktSync,
  getTraktSync,
  loadTraktSyncs,
  syncTraktSync,
  SYNC_NOW_LIMIT,
  SYNC_NOW_WINDOW_MS,
  updateTraktSync,
} from "@/lib/trakt/sync";
import type { TraktSyncsState } from "@/lib/trakt/sync";

// Settings → Account's "Trakt lists": the same calls /api/v1/trakt-syncs
// makes. Everyone manages their own; the admin sees (and can remove)
// everyone's.

export type { TraktSyncsState };
export type TraktSyncActionResult = { state?: TraktSyncsState; error?: string };

async function actor() {
  const session = await auth();
  return session?.user ?? null;
}

async function stateAfter(result: { ok: boolean; error?: string }, user: NonNullable<Awaited<ReturnType<typeof actor>>>): Promise<TraktSyncActionResult> {
  const state = await loadTraktSyncs(user);
  return result.ok ? { state } : { state, error: result.error ?? "Something went wrong." };
}

export async function addTraktSyncAction(body: {
  url: string;
  movies: boolean;
  tv: boolean;
  requestExisting: boolean;
}): Promise<TraktSyncActionResult> {
  const user = await actor();
  if (!user) return { error: "Sign in again." };
  return stateAfter(await createTraktSync(user, body), user);
}

export async function updateTraktSyncAction(id: string, body: { movies?: boolean; tv?: boolean }): Promise<TraktSyncActionResult> {
  const user = await actor();
  if (!user) return { error: "Sign in again." };
  return stateAfter(await updateTraktSync(user, id, body), user);
}

export async function removeTraktSyncAction(id: string): Promise<TraktSyncActionResult> {
  const user = await actor();
  if (!user) return { error: "Sign in again." };
  return stateAfter(await deleteTraktSync(user, id), user);
}

export async function checkTraktSyncAction(id: string): Promise<TraktSyncActionResult> {
  const user = await actor();
  if (!user) return { error: "Sign in again." };
  if (!(await canUseTraktSync(user, id))) return stateAfter({ ok: false, error: "That Trakt sync doesn't exist any more." }, user);
  if (!checkRateLimit(`trakt-sync:check:${user.id}`, SYNC_NOW_LIMIT, SYNC_NOW_WINDOW_MS)) {
    return stateAfter({ ok: false, error: "Checked a moment ago. Try again in a minute." }, user);
  }
  const sync = await getTraktSync(id);
  if (sync) await syncTraktSync(id, sync.owner.id);
  return stateAfter({ ok: true }, user);
}

export async function refreshTraktSyncsAction(): Promise<TraktSyncActionResult> {
  const user = await actor();
  if (!user) return { error: "Sign in again." };
  return { state: await loadTraktSyncs(user) };
}
