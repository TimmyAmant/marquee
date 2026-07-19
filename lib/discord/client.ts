// See the matching constant in lib/tvdb/client.ts, lib/radarr/client.ts —
// a slow/unreachable Discord shouldn't be able to hang a request.
const REQUEST_TIMEOUT_MS = 8000;

async function postToWebhook(webhookUrl: string, content: string): Promise<boolean> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return res.ok;
}

export async function sendDiscordMessage(webhookUrl: string, content: string): Promise<boolean> {
  return postToWebhook(webhookUrl, content).catch(() => false);
}

export async function verifyDiscordWebhook(webhookUrl: string): Promise<boolean> {
  return postToWebhook(webhookUrl, "✅ Marquee is now connected to this channel.").catch(
    () => false,
  );
}
