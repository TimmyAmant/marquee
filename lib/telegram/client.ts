// Telegram via a bot the admin makes with @BotFather: its token, and the chat
// (a person, group or channel the bot is in) to post to. Bot API:
// https://core.telegram.org/bots/api#sendmessage.

// Same budget as the other relays (lib/discord/client.ts): a slow Telegram
// mustn't hang anything.
const REQUEST_TIMEOUT_MS = 8000;

export type TelegramConfig = { botToken: string; chatId: string };

/** Checks the pieces before anything is sent; the message, or null when
 * they look right. Pure; unit tested. */
export function telegramConfigError(config: { botToken: string; chatId: string }): string | null {
  if (!config.botToken) return "Enter your bot's token.";
  // BotFather's tokens: the bot's numeric id, a colon, then 35-ish URL-safe characters.
  if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(config.botToken)) {
    return "That doesn't look like a bot token. It's the long code @BotFather gave you, like 123456789:AA…";
  }
  if (!config.chatId) return "Enter the chat ID to send to.";
  // A numeric id (negative for groups and channels) or a public channel's @name.
  if (!/^(-?\d{1,20}|@[A-Za-z0-9_]{5,32})$/.test(config.chatId)) {
    return "The chat ID is a number (groups and channels start with -100) or a channel's @name.";
  }
  return null;
}

async function send(config: TelegramConfig, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Plain text: titles come from TMDb and requests, so no Markdown/HTML
    // parsing that a stray character could break.
    body: JSON.stringify({ chat_id: config.chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: "manual",
  });
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => null)) as { description?: unknown } | null;
  const description = typeof body?.description === "string" ? body.description : `HTTP ${res.status}`;
  return { ok: false, error: description };
}

export async function sendTelegramMessage(config: TelegramConfig, text: string): Promise<boolean> {
  return send(config, text)
    .then((r) => r.ok)
    .catch(() => false);
}

/** Posts a test message; the error is Telegram's own wording ("chat not
 * found", "Unauthorized") so the admin can tell what to fix. */
export async function verifyTelegram(config: TelegramConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  return send(config, "✅ Marquee is now connected to this chat.").catch(() => ({
    ok: false as const,
    error: "Couldn't reach Telegram.",
  }));
}
