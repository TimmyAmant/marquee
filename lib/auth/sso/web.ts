import { SSO_COOKIE_PATH, SSO_FLOW_TTL_MS } from "@/lib/auth/sso/flows";

// Small request helpers for the SSO routes: where the browser thinks it is,
// and the cookie that binds a flow to it. Pure; unit tested.

/** The host the browser used (the reverse proxy's X-Forwarded-Host when
 * there's one), lower-cased. */
export function requestHost(headers: Pick<Headers, "get">): string | null {
  const raw = headers.get("x-forwarded-host") ?? headers.get("host");
  const first = raw?.split(",")[0]?.trim().toLowerCase();
  return first || null;
}

/** Whether this request came in on the address the identity provider sends
 * people back to. Compared by host only: a proxy that doesn't say it's
 * https shouldn't make every request look foreign. */
export function isPublicHost(publicUrl: string, headers: Pick<Headers, "get">): boolean {
  try {
    return new URL(publicUrl).host.toLowerCase() === requestHost(headers);
  } catch {
    return false;
  }
}

export function ssoCookieOptions(publicUrl: string) {
  return {
    httpOnly: true,
    // Lax: the provider's redirect back is a top-level navigation from
    // another site, which Lax cookies still go along with.
    sameSite: "lax" as const,
    secure: publicUrl.startsWith("https://"),
    path: SSO_COOKIE_PATH,
    maxAge: Math.floor(SSO_FLOW_TTL_MS / 1000),
  };
}

/**
 * Whether a form POST came from Marquee's own pages. Browsers send
 * Sec-Fetch-Site (and Origin) on every POST; a cross-site form — someone
 * else's page trying to push a visitor through an app's sign-in — says
 * "cross-site" and carries a foreign Origin. With neither header, refused.
 */
export function isSameOriginPost(headers: Pick<Headers, "get">): boolean {
  const site = headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host.toLowerCase() === requestHost(headers);
  } catch {
    return false;
  }
}
