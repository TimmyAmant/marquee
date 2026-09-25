"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  importMediaUsers,
  linkJellyfin,
  listImportCandidates,
  pollPlexLink,
  setMediaServerSignup,
  startPlexLink,
  unlinkAccount,
  type ImportCandidate,
} from "@/lib/auth/media-signin";
import type { MediaProvider } from "@/lib/auth/media-accounts";
import { getClientIp } from "@/lib/rate-limit";

// Settings → Account's "Linked accounts" (any signed-in account, for itself
// only) and the admin's "Import from Plex / Jellyfin" and sign-up toggle —
// the same operations /api/v1/me/links, /users/import and /settings/sign-in
// expose (lib/auth/media-signin.ts).

function parseProvider(value: unknown): MediaProvider | null {
  return value === "plex" || value === "jellyfin" ? value : null;
}

async function clientIp() {
  return getClientIp(await headers());
}

export type ActionResult = { error?: string; success?: boolean };

export async function startPlexLinkAction(): Promise<{ handle?: string; authUrl?: string; error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in required." };
  const result = await startPlexLink(session.user.id, await clientIp());
  return result.ok ? { handle: result.handle, authUrl: result.authUrl } : { error: result.error };
}

export async function pollPlexLinkAction(
  handle: string,
): Promise<{ status: "pending" } | { status: "done" } | { status: "error"; error: string }> {
  const session = await auth();
  if (!session?.user) return { status: "error", error: "Sign in required." };
  const poll = await pollPlexLink(session.user.id, handle, await clientIp());
  if (poll.status === "pending") return { status: "pending" };
  if (poll.status === "expired") return { status: "error", error: "That Plex sign-in expired. Try again." };
  if (!poll.ok) return { status: "error", error: poll.error };
  revalidatePath("/settings");
  return { status: "done" };
}

export async function linkJellyfinAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in required." };
  const username = formData.get("username");
  const password = formData.get("password");
  if (typeof username !== "string" || !username || typeof password !== "string" || !password) {
    return { error: "Enter your Jellyfin username and password." };
  }
  const result = await linkJellyfin(session.user.id, username, password, await clientIp());
  if (!result.ok) return { error: result.error };
  revalidatePath("/settings");
  return { success: true };
}

export async function unlinkAction(provider: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in required." };
  const parsed = parseProvider(provider);
  if (!parsed) return { error: "Invalid request." };
  const result = await unlinkAccount(session.user.id, parsed);
  if (!result.ok) return { error: result.error };
  revalidatePath("/settings");
  return { success: true };
}

export async function listImportCandidatesAction(
  provider: string,
): Promise<{ results?: ImportCandidate[]; error?: string }> {
  const admin = await requireAdmin("Only the admin can add household members.");
  if (!admin.ok) return { error: admin.error };
  const parsed = parseProvider(provider);
  if (!parsed) return { error: "Invalid request." };
  const result = await listImportCandidates(parsed);
  return result.ok ? { results: result.results } : { error: result.error };
}

export async function importMembersAction(
  provider: string,
  ids: string[],
): Promise<{ created?: number; skipped?: number; error?: string }> {
  const admin = await requireAdmin("Only the admin can add household members.");
  if (!admin.ok) return { error: admin.error };
  const parsed = parseProvider(provider);
  if (!parsed) return { error: "Invalid request." };
  const result = await importMediaUsers(parsed, ids);
  if (!result.ok) return { error: result.error };
  revalidatePath("/settings");
  return { created: result.createdIds.length, skipped: result.skipped };
}

export async function setMediaServerSignupAction(value: boolean): Promise<ActionResult> {
  const admin = await requireAdmin("Only the admin can change sign-in settings.");
  if (!admin.ok) return { error: admin.error };
  if (typeof value !== "boolean") return { error: "Invalid request." };
  await setMediaServerSignup(value);
  revalidatePath("/settings");
  return { success: true };
}
