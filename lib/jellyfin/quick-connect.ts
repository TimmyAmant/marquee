import { clientAuthorization, endJellyfinSession, parseJellyfinAuthResult, type JellyfinUser } from "@/lib/jellyfin/accounts";

// Jellyfin's Quick Connect (10.8+): Marquee asks the admin's Jellyfin server
// for a six-character code, the person approves that code in a Jellyfin app
// they're already signed in to, and Jellyfin then vouches for who they are —
// no password typed into Marquee at all. Endpoints are Jellyfin's OpenAPI:
//   GET  /QuickConnect/Enabled                → bool
//   POST /QuickConnect/Initiate               → QuickConnectResult { Secret, Code, … }
//   GET  /QuickConnect/Connect?secret=…       → QuickConnectResult { Authenticated, … }
//   POST /Users/AuthenticateWithQuickConnect  { Secret } → AuthenticationResult
// The secret never leaves Marquee's server: clients only see the code and a
// random handle (lib/auth/login-tickets.ts). Emby has no Quick Connect.

const REQUEST_TIMEOUT_MS = 8000;

function headers(deviceId: string): Record<string, string> {
  const authorization = clientAuthorization(deviceId);
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: authorization,
    "X-Emby-Authorization": authorization,
  };
}

function root(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export class QuickConnectUnavailable extends Error {}

export async function isQuickConnectEnabled(baseUrl: string): Promise<boolean> {
  const res = await fetch(`${root(baseUrl)}/QuickConnect/Enabled`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`Quick Connect check failed (${res.status})`);
  return (await res.json()) === true;
}

/** Parses a QuickConnectResult. Pure; unit tested. */
export function parseQuickConnectResult(body: unknown): { secret: string; code: string; authenticated: boolean } | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  if (typeof raw.Secret !== "string" || !raw.Secret || typeof raw.Code !== "string" || !raw.Code) return null;
  return { secret: raw.Secret, code: raw.Code, authenticated: raw.Authenticated === true };
}

/** Starts a Quick Connect request under `deviceId`. Throws
 * QuickConnectUnavailable when the server has it turned off (or is too old). */
export async function initiateQuickConnect(baseUrl: string, deviceId: string): Promise<{ secret: string; code: string }> {
  if (!(await isQuickConnectEnabled(baseUrl))) throw new QuickConnectUnavailable();
  const url = `${root(baseUrl)}/QuickConnect/Initiate`;
  let res = await fetch(url, {
    method: "POST",
    headers: headers(deviceId),
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  // 10.8 only knew GET here.
  if (res.status === 404 || res.status === 405) {
    res = await fetch(url, { headers: headers(deviceId), redirect: "manual", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  }
  if (res.status === 401 || res.status === 403) throw new QuickConnectUnavailable();
  if (!res.ok) throw new Error(`Quick Connect start failed (${res.status})`);
  const parsed = parseQuickConnectResult(await res.json());
  if (!parsed) throw new Error("Quick Connect answered without a code");
  return { secret: parsed.secret, code: parsed.code };
}

/** Whether the code has been approved yet. Null once Jellyfin has forgotten
 * the request (it expires them after a few minutes). */
export async function checkQuickConnect(baseUrl: string, secret: string, deviceId: string): Promise<boolean | null> {
  const res = await fetch(`${root(baseUrl)}/QuickConnect/Connect?${new URLSearchParams({ secret })}`, {
    headers: headers(deviceId),
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 404 || res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Quick Connect check failed (${res.status})`);
  const parsed = parseQuickConnectResult(await res.json());
  return parsed ? parsed.authenticated : null;
}

/** Trades an approved request for the Jellyfin user it was approved as. The
 * session this creates is logged out again straight away. Null when
 * Jellyfin refuses (not approved, expired, or a disabled user). */
export async function authenticateWithQuickConnect(
  baseUrl: string,
  secret: string,
  deviceId: string,
): Promise<JellyfinUser | null> {
  const res = await fetch(`${root(baseUrl)}/Users/AuthenticateWithQuickConnect`, {
    method: "POST",
    headers: headers(deviceId),
    body: JSON.stringify({ Secret: secret }),
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error(`Quick Connect sign-in failed (${res.status})`);
  const parsed = parseJellyfinAuthResult(await res.json());
  if (!parsed) throw new Error("Quick Connect sign-in answered without a user");
  if (parsed.accessToken) await endJellyfinSession(root(baseUrl), deviceId, parsed.accessToken);
  return parsed.user.isDisabled ? null : parsed.user;
}
