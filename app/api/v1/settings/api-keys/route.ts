import { withApi } from "@/lib/api/handler";
import { apiJson, msg } from "@/lib/api/errors";
import { requireApiAdminSession } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { invalid, readJsonBody } from "@/lib/api/request";
import { parseApiKeyInput } from "@/lib/api/api-keys";
import { getT } from "@/lib/i18n/server";
import { createApiKey, listApiKeys } from "@/lib/api/api-key-store";
import type { ApiKey, ApiKeyCreated, ListResponse } from "@/lib/api/types";

/** Settings › Integrations › API keys (admin, signed in — never with a key). */
export const GET = withApi(async (request): Promise<ListResponse<ApiKey>> => {
  await requireApiAdminSession(request, msg("server.onlyAdminApiKeys"));
  return { results: await listApiKeys() };
});

/** Creates a key: `201` with its secret, which is never shown again. */
export const POST = withApi(async (request) => {
  const ctx = await requireApiAdminSession(request, msg("server.onlyAdminApiKeys"));
  const parsed = parseApiKeyInput(await readJsonBody(request), await getT());
  if (!parsed.ok) throw invalid(parsed.error);
  const { key, apiKey } = unwrap(await createApiKey(ctx.user.id, parsed.input));
  const body: ApiKeyCreated = { key, apiKey };
  return apiJson(body, { status: 201 });
});
