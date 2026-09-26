// Pushover: an application token (made at pushover.net/apps) and the user or
// group key to deliver to. API: https://pushover.net/api#messages.

const REQUEST_TIMEOUT_MS = 8000;

export type PushoverConfig = { appToken: string; userKey: string };

/** Pure; unit tested. Both are 30 characters of letters and digits. */
export function pushoverConfigError(config: { appToken: string; userKey: string }): string | null {
  if (!/^[A-Za-z0-9]{30}$/.test(config.appToken)) {
    return "The application token is the 30-character code from your app's page on pushover.net.";
  }
  if (!/^[A-Za-z0-9]{30}$/.test(config.userKey)) {
    return "The user key is the 30-character code at the top of your pushover.net dashboard (or a group key).";
  }
  return null;
}

async function send(
  config: PushoverConfig,
  title: string,
  message: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("https://api.pushover.net/1/messages.json", {
    method: "POST",
    body: new URLSearchParams({
      token: config.appToken,
      user: config.userKey,
      title: title.slice(0, 250),
      message: message.slice(0, 1024),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: "manual",
  });
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => null)) as { errors?: unknown } | null;
  const errors = Array.isArray(body?.errors) ? body.errors.filter((e) => typeof e === "string") : [];
  return { ok: false, error: errors.join(" ") || `HTTP ${res.status}` };
}

export async function sendPushoverMessage(config: PushoverConfig, title: string, message: string): Promise<boolean> {
  return send(config, title, message)
    .then((r) => r.ok)
    .catch(() => false);
}

/** Sends a test notification; the error is Pushover's own ("application
 * token is invalid", "user key is invalid"). */
export async function verifyPushover(config: PushoverConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  return send(config, "Marquee", "Marquee is now connected to Pushover.").catch(() => ({
    ok: false as const,
    error: "Couldn't reach Pushover.",
  }));
}
