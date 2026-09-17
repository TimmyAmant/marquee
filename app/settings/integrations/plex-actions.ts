"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { checkPlexAuthFor, startPlexAuthFor } from "@/lib/integrations/manage";

export type StartPlexAuthResult = { error?: string; authUrl?: string; pinId?: number };

export async function startPlexAuth(): Promise<StartPlexAuthResult> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  const result = await startPlexAuthFor(admin.userId);
  return result.ok ? { authUrl: result.authUrl, pinId: result.pinId } : { error: result.error };
}

export type PlexAuthStatus = {
  connected: boolean;
  error?: string;
  movieCount?: number;
  tvCount?: number;
};

export async function checkPlexAuthStatus(pinId: number): Promise<PlexAuthStatus> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { connected: false, error: admin.error };

  return checkPlexAuthFor(admin.userId, pinId);
}
