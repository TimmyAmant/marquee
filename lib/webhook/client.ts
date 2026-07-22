// See the matching constant in lib/discord/client.ts, lib/tvdb/client.ts —
// a slow/unreachable endpoint shouldn't be able to hang a request.
const REQUEST_TIMEOUT_MS = 8000;

export type WebhookPayload = {
  event: string;
  title: string;
  message: string;
};

async function postToWebhook(url: string, payload: WebhookPayload): Promise<boolean> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return res.ok;
}

export async function sendWebhookNotification(url: string, payload: WebhookPayload): Promise<boolean> {
  return postToWebhook(url, payload).catch(() => false);
}

export async function verifyWebhookUrl(url: string): Promise<boolean> {
  return postToWebhook(url, {
    event: "test",
    title: "Marquee",
    message: "Marquee is now connected to this webhook.",
  }).catch(() => false);
}
