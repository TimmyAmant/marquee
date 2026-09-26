"use server";

import { revalidatePath } from "next/cache";
import { regenerateWebhookSecret } from "@/lib/integrations/credentials";
import { requireAdmin } from "@/lib/auth/require-admin";

// Sonarr/Radarr servers themselves are managed in ./arr-server-actions.ts.

export type RegenerateWebhookSecretState = { secret?: string; error?: string };

export async function regenerateWebhookSecretAction(): Promise<RegenerateWebhookSecretState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  const secret = await regenerateWebhookSecret(admin.userId);
  revalidatePath("/settings/integrations");
  return { secret };
}
