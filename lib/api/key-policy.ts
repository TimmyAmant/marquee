// What an admin-issued API key may call — the one place it's decided. Pure
// (method + path + scope in, decision out), so it's tested against every
// route file, and the OpenAPI description reports it per operation.
//
// It runs twice for every request that carries a key: in withApi before the
// route's own code (so a route that validates its body first, or forgets
// its auth check, still can't be reached), and again in requireApiUser.
import type { ApiKeyScope } from "@/lib/db/schema";

export const API_V1_PREFIX = "/api/v1";

/** Methods that never change anything. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** POSTs that only read (and so a read-only key may make). */
const READ_ONLY_POSTS = new Set(["/surprise"]);

/** Never reachable with a key, whatever its scope or the method: managing
 * keys, signing in/out and linking accounts, and the admin settings that
 * hold other services' credentials or secrets. */
const DENIED_PREFIXES = [
  "/settings/api-keys",
  "/auth",
  "/me/links",
  "/settings/integrations",
  "/settings/arr-servers",
  "/settings/sso",
  "/settings/sign-in",
  "/users/import",
];

/** The admin settings a key may read (GET only); every other /settings path
 * is refused, and nothing under /settings may be changed with a key. */
const READABLE_SETTINGS = [
  "/settings/activity",
  "/settings/jobs",
  "/settings/about",
  "/settings/not-found",
  "/settings/notification-events",
  "/settings/blocklist",
];

/** Read with any key, but never changed with one: household accounts
 * (roles, passwords, photos), where someone's notifications go, and the
 * standing syncs that file requests on someone's behalf. */
const NO_CHANGES_PREFIXES = ["/users", "/me/notification-channels", "/me/plex-watchlist", "/trakt-syncs", "/settings"];

export const KEY_DENIED_MESSAGE = "API keys can't manage API keys, sign-in, household accounts or admin settings.";
export const KEY_READ_ONLY_MESSAGE = "This API key is read-only.";

export type KeyDecision = { allowed: true } | { allowed: false; message: string };

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** "/api/v1/Settings//integrations/" → "/settings/integrations"; null when
 * it isn't an /api/v1 path or doesn't decode (refused outright). Lower-cased
 * and percent-decoded so no spelling of a denied path slips past. */
export function normalizeApiPath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = pathname
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch {
    return null;
  }
  const collapsed = decoded.replace(/\/{2,}/g, "/").toLowerCase();
  if (!under(collapsed, API_V1_PREFIX)) return null;
  const rest = collapsed.slice(API_V1_PREFIX.length).replace(/\/+$/, "");
  return rest === "" ? "/" : rest;
}

export function apiKeyDecision(method: string, pathname: string, scope: ApiKeyScope): KeyDecision {
  const path = normalizeApiPath(pathname);
  if (path === null || path.split("/").some((segment) => segment === "." || segment === "..")) {
    return { allowed: false, message: KEY_DENIED_MESSAGE };
  }
  const verb = method.toUpperCase();
  const safe = SAFE_METHODS.has(verb);

  if (DENIED_PREFIXES.some((prefix) => under(path, prefix))) return { allowed: false, message: KEY_DENIED_MESSAGE };
  if (under(path, "/settings") && !READABLE_SETTINGS.some((prefix) => under(path, prefix))) {
    return { allowed: false, message: KEY_DENIED_MESSAGE };
  }
  if (!safe && NO_CHANGES_PREFIXES.some((prefix) => under(path, prefix))) {
    return { allowed: false, message: KEY_DENIED_MESSAGE };
  }

  if (scope === "read" && !safe && !(verb === "POST" && READ_ONLY_POSTS.has(path))) {
    return { allowed: false, message: KEY_READ_ONLY_MESSAGE };
  }
  return { allowed: true };
}

/** For the OpenAPI description: which keys may make this call. */
export function keyAccessFor(method: string, apiPath: string): "read" | "full" | "none" {
  const pathname = `${API_V1_PREFIX}${apiPath}`;
  if (apiKeyDecision(method, pathname, "read").allowed) return "read";
  if (apiKeyDecision(method, pathname, "full").allowed) return "full";
  return "none";
}
