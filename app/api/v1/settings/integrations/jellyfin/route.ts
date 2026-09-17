import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { disconnectHandler, INTEGRATIONS_FORBIDDEN } from "@/lib/api/routes/integrations";
import { testAndSaveJellyfinConnection } from "@/lib/integrations/manage";
import type { Ok } from "@/lib/api/types";

/** Test a Jellyfin server URL + API key and save it. */
export const PUT = withApi(async (request): Promise<Ok> => {
  const ctx = await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
  const body = await readJsonBody(request);
  unwrap(
    await testAndSaveJellyfinConnection(ctx.user.id, {
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : "",
      apiKey: typeof body.apiKey === "string" ? body.apiKey : "",
    }),
  );
  return { ok: true };
});

export const DELETE = disconnectHandler("jellyfin");
