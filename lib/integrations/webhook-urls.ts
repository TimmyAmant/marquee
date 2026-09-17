// Pure (client-safe) helpers for the Sonarr/Radarr → Marquee webhook URLs
// shown on Settings → Integrations and returned by /api/v1.

/** The base URL Sonarr/Radarr should post to, derived from the incoming
 * request's Host / X-Forwarded-Proto headers. */
export function webhookBaseUrl(headers: Pick<Headers, "get">): string {
  const proto = headers.get("x-forwarded-proto") ?? "http";
  const host = headers.get("host");
  return `${proto}://${host}`;
}

export function arrWebhookUrls(baseUrl: string, userId: string, secret: string) {
  return {
    radarr: `${baseUrl}/api/webhooks/radarr/${userId}?secret=${secret}`,
    sonarr: `${baseUrl}/api/webhooks/sonarr/${userId}?secret=${secret}`,
  };
}
