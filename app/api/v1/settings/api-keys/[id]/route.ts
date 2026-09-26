import { withApi } from "@/lib/api/handler";
import { ApiError, msg } from "@/lib/api/errors";
import { requireApiAdminSession } from "@/lib/api/auth";
import { parseUuidSegment } from "@/lib/api/request";
import { revokeApiKey } from "@/lib/api/api-key-store";
import type { Ok } from "@/lib/api/types";

/** Revokes a key: anything using it gets 401 from its next call. */
export const DELETE = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  await requireApiAdminSession(request, msg("server.onlyAdminApiKeys"));
  const id = parseUuidSegment(params.id, msg("server.apiKeyGone"));
  if (!(await revokeApiKey(id))) throw ApiError.of("not_found", msg("server.apiKeyGone"));
  return { ok: true };
});
