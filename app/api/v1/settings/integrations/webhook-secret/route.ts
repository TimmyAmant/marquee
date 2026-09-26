import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { INTEGRATIONS_FORBIDDEN } from "@/lib/api/routes/integrations";
import { regenerateWebhookSecret } from "@/lib/integrations/credentials";
import { arrWebhookUrls, webhookBaseUrl } from "@/lib/integrations/webhook-urls";
import { revalidatePath } from "next/cache";
import type { IntegrationsSettings } from "@/lib/api/types";

/** "Regenerate secret" for the Sonarr/Radarr webhook URLs. The old URLs stop
 * working immediately. */
export const POST = withApi(async (request): Promise<IntegrationsSettings["arrWebhooks"]> => {
  const ctx = await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
  const secret = await regenerateWebhookSecret(ctx.user.id);
  revalidatePath("/settings/integrations");
  const urls = arrWebhookUrls(webhookBaseUrl(request.headers), ctx.user.id, secret);
  return {
    secret,
    radarrUrl: urls.radarr,
    sonarrUrl: urls.sonarr,
    radarr4kUrl: urls.radarr4k,
    sonarr4kUrl: urls.sonarr4k,
  };
});
