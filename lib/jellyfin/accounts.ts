import { randomUUID } from "crypto";
import { APP_VERSION } from "@/lib/api/version";
import { jellyfinTokenHeaders, type JellyfinConfig } from "@/lib/jellyfin/client";

// Jellyfin user lookups behind "Sign in with Jellyfin" and "Import from
// Jellyfin" (lib/auth/media-signin.ts). Endpoints and shapes are Jellyfin's
// OpenAPI (https://api.jellyfin.org): `POST /Users/AuthenticateByName` →
// AuthenticationResult { User: UserDto, AccessToken, ServerId, SessionInfo },
// and `GET /Users` → UserDto[] (UserDto: Name, Id, HasPassword,
// PrimaryImageTag, Policy { IsAdministrator, IsDisabled, IsHidden }).

const REQUEST_TIMEOUT_MS = 8000;

export type JellyfinUser = {
  id: string;
  name: string;
  isAdministrator: boolean;
  isDisabled: boolean;
  primaryImageTag: string | null;
};

/** Jellyfin serializes user ids as 32 hex digits without dashes, but its
 * routes accept (and older servers have returned) the dashed GUID form too.
 * Stored and compared in one form so an import and a later sign-in meet. */
export function normalizeJellyfinUserId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hex = value.replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(hex) ? hex : null;
}

export function parseJellyfinUser(body: unknown): JellyfinUser | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const id = normalizeJellyfinUserId(raw.Id);
  const name = typeof raw.Name === "string" ? raw.Name.trim() : "";
  if (!id || !name) return null;
  const policy = raw.Policy && typeof raw.Policy === "object" ? (raw.Policy as Record<string, unknown>) : {};
  return {
    id,
    name,
    isAdministrator: policy.IsAdministrator === true,
    isDisabled: policy.IsDisabled === true,
    primaryImageTag: typeof raw.PrimaryImageTag === "string" && raw.PrimaryImageTag ? raw.PrimaryImageTag : null,
  };
}

/** The user an AuthenticateByName answer is for. The access token in it is
 * read only by `authenticateJellyfinUser`, to end the session again. */
export function parseJellyfinAuthResult(body: unknown): { user: JellyfinUser; accessToken: string | null } | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const user = parseJellyfinUser(raw.User);
  if (!user) return null;
  return { user, accessToken: typeof raw.AccessToken === "string" && raw.AccessToken ? raw.AccessToken : null };
}

/** Header values are quoted strings; a stray quote or comma would break the
 * header apart. */
function quoted(value: string): string {
  return `"${value.replace(/["\\,\r\n]/g, "")}"`;
}

/** The MediaBrowser client descriptor Jellyfin requires on an
 * unauthenticated call. Sent as both `Authorization` (the only one
 * Jellyfin 12 accepts — checked against a 12.1 server) and
 * `X-Emby-Authorization` (older servers). */
function clientAuthorization(deviceId: string, token?: string): string {
  const parts = [
    `Client=${quoted("Marquee")}`,
    `Device=${quoted("Marquee sign-in")}`,
    `DeviceId=${quoted(deviceId)}`,
    `Version=${quoted(APP_VERSION)}`,
    ...(token ? [`Token=${quoted(token)}`] : []),
  ];
  return `MediaBrowser ${parts.join(", ")}`;
}

export type JellyfinAuthOutcome = { ok: true; user: JellyfinUser } | { ok: false };

/**
 * Checks a username/password against the admin's Jellyfin server — the only
 * place the password goes; it isn't stored or logged. Not the admin API key:
 * the whole point is that the server itself vouches for this user. A 401
 * (wrong password, or a disabled user) is `ok: false`; anything else going
 * wrong throws, so the caller reports "couldn't reach Jellyfin" rather than
 * "wrong password".
 *
 * Signing in creates a Jellyfin session under a one-off device id; it's
 * logged out again right away (`POST /Sessions/Logout`) so every Marquee
 * sign-in doesn't leave a device behind in the Jellyfin dashboard.
 */
export async function authenticateJellyfinUser(
  baseUrl: string,
  username: string,
  password: string,
): Promise<JellyfinAuthOutcome> {
  const root = baseUrl.replace(/\/+$/, "");
  const deviceId = `marquee-${randomUUID()}`;
  const authorization = clientAuthorization(deviceId);
  const res = await fetch(`${root}/Users/AuthenticateByName`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authorization,
      "X-Emby-Authorization": authorization,
    },
    body: JSON.stringify({ Username: username, Pw: password }),
    // Never follow a redirect with the password in the body: a 307/308
    // would re-send it wherever it points. A redirect is a failure here.
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 401 || res.status === 403) return { ok: false };
  if (!res.ok) throw new Error(`Jellyfin sign-in failed (${res.status})`);

  const parsed = parseJellyfinAuthResult(await res.json());
  if (!parsed) throw new Error("Jellyfin sign-in answered without a user");

  if (parsed.accessToken) {
    const signedIn = clientAuthorization(deviceId, parsed.accessToken);
    await fetch(`${root}/Sessions/Logout`, {
      method: "POST",
      headers: { Authorization: signedIn, "X-Emby-Authorization": signedIn, "X-Emby-Token": parsed.accessToken },
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }).catch(() => undefined);
  }

  if (parsed.user.isDisabled) return { ok: false };
  return { ok: true, user: parsed.user };
}

/** Every user on the admin's Jellyfin server (admin API key). */
export async function listJellyfinUsers(config: JellyfinConfig): Promise<JellyfinUser[]> {
  const res = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/Users`, {
    headers: { Accept: "application/json", ...jellyfinTokenHeaders(config.apiKey) },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Failed to list Jellyfin users (${res.status})`);
  const body: unknown = await res.json();
  if (!Array.isArray(body)) return [];
  return body.map(parseJellyfinUser).filter((u): u is JellyfinUser => u !== null);
}

/** A user's profile picture on the admin's Jellyfin server, or null when
 * they haven't set one. Served by Jellyfin without authentication. */
export function jellyfinUserImageUrl(baseUrl: string, user: JellyfinUser): string | null {
  if (!user.primaryImageTag) return null;
  const params = new URLSearchParams({ tag: user.primaryImageTag });
  return `${baseUrl.replace(/\/+$/, "")}/Users/${user.id}/Images/Primary?${params.toString()}`;
}
