"use server";

import { auth } from "@/auth";
import { syncNowForUser } from "@/lib/integrations/manage";

export type SyncNowState = { error?: string; success?: boolean };

/** Forces an immediate sync of every connected integration, bypassing the
 * usual 15-minute staleness gate — for when you don't want to wait for it
 * (e.g. right after starting a download) rather than an actual bug in the
 * automatic sync. */
export async function syncNowAction(
  _prevState: SyncNowState | undefined,
  _formData: FormData,
): Promise<SyncNowState> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in required." };

  const result = await syncNowForUser(session.user.id);
  return result.ok ? { success: true } : { error: result.error };
}
