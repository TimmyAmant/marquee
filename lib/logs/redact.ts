// Settings › Logs shows what the server wrote to its console, and a log line
// can carry a secret: an API key in a URL, a Plex token, a webhook address,
// a password in a JSON body. Everything is masked before it's kept, in
// memory or on disk. Pure; unit tested.

const MASK = "[redacted]";

const PATTERNS: [RegExp, string | ((...m: string[]) => string)][] = [
  // user:password@ in a URL.
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, `$1${MASK}@`],
  // ?apikey=…, &X-Plex-Token=…, token=…, password=… (query strings, forms).
  [
    /\b((?:x-)?(?:api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|token|password|passwd|pass|secret|client[_-]?secret|x-plex-token|auth|code|pin)=)[^\s&"',;)]+/gi,
    `$1${MASK}`,
  ],
  // Headers: Authorization: Bearer …, X-Api-Key: …, Cookie: …
  [/\b(authorization|proxy-authorization|x-api-key|x-plex-token|x-emby-token|x-mediabrowser-token|cookie|set-cookie)(["']?\s*:\s*["']?)[^\r\n"',}]+/gi, `$1$2${MASK}`],
  [/\b(bearer|basic|mediabrowser)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${MASK}`],
  // JSON-ish "password": "…", apiKey: '…'
  [
    /(["']?(?:password|passwd|secret|api[_-]?key|apikey|token|access[_-]?token|refresh[_-]?token|bot[_-]?token|app[_-]?token|user[_-]?key|webhook[_-]?url|client[_-]?secret)["']?\s*[:=]\s*)(["'])(?:(?!\2).)*\2/gi,
    `$1$2${MASK}$2`,
  ],
  // Marquee's own device tokens and API keys.
  [/\bmqt?_[A-Za-z0-9_-]{16,}/g, MASK],
  // Telegram bot tokens (also inside api.telegram.org/bot…/ URLs).
  [/\b(bot)?\d{5,}:[A-Za-z0-9_-]{30,}/g, (_m, bot) => `${bot ?? ""}${MASK}`],
  // Webhook addresses whose path is the credential.
  [/(discord(?:app)?\.com\/api\/webhooks\/)[^\s"']+/gi, `$1${MASK}`],
  [/(hooks\.slack\.com\/(?:services|workflows|triggers)\/)[^\s"']+/gi, `$1${MASK}`],
  [/(\/api\/webhooks\/(?:servers\/)?[^\s/"']+\/)[^\s"'?]+/gi, `$1${MASK}`],
  // JSON Web Tokens.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, MASK],
  // Long runs of hex or key-like characters (Sonarr/Radarr keys are 32 hex).
  [/\b[A-Fa-f0-9]{32,}\b/g, MASK],
  [/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{40,}\b/g, MASK],
];

/** `text` with anything that looks like a credential masked. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PATTERNS) {
    out = typeof replacement === "string" ? out.replace(pattern, replacement) : out.replace(pattern, replacement);
  }
  return out;
}
