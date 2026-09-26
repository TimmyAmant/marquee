"use server";

import type { IntegrationProvider } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/require-admin";
import { disconnectIntegration } from "@/lib/integrations/manage";
import { getT } from "@/lib/i18n/server";

export type DisconnectState = { error?: string; success?: boolean };

/** Removes a saved integration entirely, plus whatever synced data that
 * provider owns — see disconnectIntegration. */
export async function disconnectIntegrationAction(
  provider: IntegrationProvider,
): Promise<DisconnectState> {
  const admin = await requireAdmin((await getT())("integrations.adminOnly"));
  if (!admin.ok) return { error: admin.error };

  await disconnectIntegration(admin.userId, provider);
  return { success: true };
}
