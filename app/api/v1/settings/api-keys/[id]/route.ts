import { withApi } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { requireApiAdminSession } from "@/lib/api/auth";
import { parseUuidSegment } from "@/lib/api/request";
import { API_KEY_NOT_FOUND, API_KEYS_FORBIDDEN } from "@/lib/api/api-keys";
import { revokeApiKey } from "@/lib/api/api-key-store";
import type { Ok } from "@/lib/api/types";

/** Revokes a key: anything using it gets 401 from its next call. */
export const DELETE = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  await requireApiAdminSession(request, API_KEYS_FORBIDDEN);
  const id = parseUuidSegment(params.id, API_KEY_NOT_FOUND);
  if (!(await revokeApiKey(id))) throw ApiError.of("not_found", API_KEY_NOT_FOUND);
  return { ok: true };
});
