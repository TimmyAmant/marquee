// See the matching constant in lib/discord/client.ts, lib/webhook/client.ts —
// a slow/unreachable server shouldn't be able to hang a request.
const REQUEST_TIMEOUT_MS = 8000;

// ntfy's own publish API: POST plain text to the topic URL, with the title
// and an emoji "tag" set via headers rather than the body — see
// https://docs.ntfy.sh/publish/.
async function postToNtfy(topicUrl: string, title: string, message: string): Promise<boolean> {
  const res = await fetch(topicUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      Title: title,
    },
    body: message,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return res.ok;
}

export async function sendNtfyMessage(topicUrl: string, title: string, message: string): Promise<boolean> {
  return postToNtfy(topicUrl, title, message).catch(() => false);
}

export async function verifyNtfyUrl(topicUrl: string): Promise<boolean> {
  return postToNtfy(topicUrl, "Marquee", "Marquee is now connected to this topic.").catch(() => false);
}
