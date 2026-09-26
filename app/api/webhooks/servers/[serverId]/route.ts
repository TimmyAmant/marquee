import { getArrServerById } from "@/lib/arr/servers";
import { handleArrWebhookEvent, providedSecret, rejectSecret, secretsMatch } from "@/lib/arr/webhook";

// One Sonarr/Radarr server's own webhook URL (Settings → Integrations shows
// it on each server): /api/webhooks/servers/{serverId}?secret=… or the
// secret in an X-Marquee-Secret header. Notifies the admin the server
// belongs to, "in 4K" for a 4K server, and re-syncs the library.

export async function POST(request: Request, { params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params;
  const secret = providedSecret(request);
  const server = await getArrServerById(serverId);
  if (!secret || !server || !secretsMatch(secret, server.webhookSecret)) return rejectSecret(request);

  return handleArrWebhookEvent(request, { ownerId: server.userId, kind: server.kind, fourK: server.is4k });
}
