"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { API_KEYS_FORBIDDEN, parseApiKeyInput } from "@/lib/api/api-keys";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api/api-key-store";
import type { ApiKey, ApiKeyCreated } from "@/lib/api/types";

// Settings › Integrations › API keys, on the admin's browser session.
// /api/v1/settings/api-keys is the same for the apps. The secret only ever
// travels back in createApiKeyAction's answer, once.

export type ApiKeyActionResult = { error?: string; keys?: ApiKey[]; created?: ApiKeyCreated };

export async function createApiKeyAction(input: {
  name: string;
  scope: string;
  actAsUserId: string | null;
  expiresInDays: number | null;
}): Promise<ApiKeyActionResult> {
  const admin = await requireAdmin(API_KEYS_FORBIDDEN);
  if (!admin.ok) return { error: admin.error };

  const parsed = parseApiKeyInput(input);
  if (!parsed.ok) return { error: parsed.error };
  const result = await createApiKey(admin.userId, parsed.input);
  if (!result.ok) return { error: result.error };
  return { created: { key: result.key, apiKey: result.apiKey }, keys: await listApiKeys() };
}

export async function revokeApiKeyAction(id: string): Promise<ApiKeyActionResult> {
  const admin = await requireAdmin(API_KEYS_FORBIDDEN);
  if (!admin.ok) return { error: admin.error };
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { error: "That API key doesn't exist any more." };

  await revokeApiKey(id);
  return { keys: await listApiKeys() };
}
