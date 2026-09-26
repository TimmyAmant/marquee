import { ApiError } from "@/lib/api/errors";
import { can, type Permission } from "@/lib/users/permissions";
import { parseBearerToken } from "@/lib/api/tokens";
import { authenticateApiToken, type AuthenticatedToken } from "@/lib/api/token-store";
import { authenticateApiKey } from "@/lib/api/api-key-store";
import { API_KEY_FAILURE_LIMIT, API_KEY_FAILURE_WINDOW_MS, parseApiKeyCredential } from "@/lib/api/api-keys";
import { apiKeyDecision } from "@/lib/api/key-policy";
import { getClientIp, isRateLimited, recordFailedAttempt } from "@/lib/rate-limit";
import { getLibraryOwnerUserId, type ViewerIdentity } from "@/lib/integrations/library-owner";
import type { ApiKeyScope } from "@/lib/db/schema";

export type ApiUser = AuthenticatedToken["user"] & { isAdmin: boolean };

/** What the request signed in with: an app's device token, or an
 * admin-issued API key (lib/api/api-keys.ts). */
export type ApiCredentialInfo =
  | { kind: "token"; tokenId: string; expiresAt: Date }
  | { kind: "apiKey"; keyId: string; scope: ApiKeyScope };

export type ApiContext = {
  credential: ApiCredentialInfo;
  /** The device token's id — null for an API key. */
  tokenId: string | null;
  user: ApiUser;
  /** Resolved on first use (it costs a few credential lookups) and memoized —
   * most endpoints need it, polling endpoints like the unread count don't. */
  libraryOwnerId: () => Promise<string>;
  /** The same "who's asking, whose library" shape web pages get from
   * getViewerContext(), for handing to shared page loaders. */
  viewer: () => Promise<Extract<ViewerIdentity, { userId: string }>>;
};

const UNAUTHORIZED_MESSAGE = "Sign in again — this session is missing, expired or revoked.";
const KEY_UNAUTHORIZED_MESSAGE = "This API key is missing, expired or revoked.";
const KEY_CONFLICT_MESSAGE = "Send an API key or a session token, not both.";
const KEY_RATE_LIMITED_MESSAGE = "Too many attempts with a wrong API key. Try again in a few minutes.";

/** One authentication per request, however many times a handler (and
 * withApi before it) asks — keyed on the Request object itself. */
const resolved = new WeakMap<Request, Promise<ApiContext>>();

function contextFor(user: AuthenticatedToken["user"], credential: ApiCredentialInfo): ApiContext {
  const apiUser: ApiUser = { ...user, isAdmin: user.role === "admin" };
  let ownerPromise: Promise<string> | null = null;
  const libraryOwnerId = () => (ownerPromise ??= getLibraryOwnerUserId(apiUser.id));
  return {
    credential,
    tokenId: credential.kind === "token" ? credential.tokenId : null,
    user: apiUser,
    libraryOwnerId,
    viewer: async () => ({ userId: apiUser.id, isAdmin: apiUser.isAdmin, libraryOwnerId: await libraryOwnerId() }),
  };
}

function keyFailureBucket(request: Request): string {
  return `api-key:${getClientIp(request) ?? "unknown"}`;
}

async function authenticate(request: Request): Promise<ApiContext> {
  const credential = parseApiKeyCredential(request.headers);

  if (credential.kind === "none") {
    const token = parseBearerToken(request.headers.get("authorization"));
    if (!token) throw ApiError.of("unauthorized", UNAUTHORIZED_MESSAGE);
    const authenticated = await authenticateApiToken(token);
    if (!authenticated) throw ApiError.of("unauthorized", UNAUTHORIZED_MESSAGE);
    return contextFor(authenticated.user, {
      kind: "token",
      tokenId: authenticated.tokenId,
      expiresAt: authenticated.expiresAt,
    });
  }

  if (credential.kind === "conflict") throw ApiError.of("unauthorized", KEY_CONFLICT_MESSAGE);

  // Keys are 256 random bits, so this isn't what keeps them safe — it keeps
  // a misconfigured widget or a scanner from hammering the database.
  const bucket = keyFailureBucket(request);
  if (isRateLimited(bucket, API_KEY_FAILURE_LIMIT)) throw ApiError.of("rate_limited", KEY_RATE_LIMITED_MESSAGE);

  const key = credential.kind === "apiKey" ? await authenticateApiKey(credential.key) : null;
  if (!key) {
    recordFailedAttempt(bucket, API_KEY_FAILURE_WINDOW_MS);
    throw ApiError.of("unauthorized", KEY_UNAUTHORIZED_MESSAGE);
  }

  const decision = apiKeyDecision(request.method, new URL(request.url).pathname, key.scope);
  if (!decision.allowed) throw ApiError.of("forbidden", decision.message);

  return contextFor(key.user, { kind: "apiKey", keyId: key.keyId, scope: key.scope });
}

/**
 * Authentication for /api/v1 handlers: a device token (`Authorization:
 * Bearer mqt_…`) or an admin-issued API key (`X-Api-Key: mq_…` or `Bearer
 * mq_…`). Looks the credential up by hash and reads the user's role fresh
 * from `users`. An API key is also held to lib/api/key-policy.ts (read-only
 * keys can't change anything; no key reaches key management or admin
 * settings). Throws ApiError 401 (unknown/expired/revoked), 403 (a key
 * outside its scope) or 429 (too many wrong keys).
 */
export function requireApiUser(request: Request): Promise<ApiContext> {
  let pending = resolved.get(request);
  if (!pending) {
    pending = authenticate(request);
    resolved.set(request, pending);
  }
  return pending;
}

/** Whether the credential behind `ctx` still works — for a long-lived
 * response (the notification stream) re-checking it now and then. Null when
 * the check itself failed (try again later). */
export async function credentialStillValid(request: Request, ctx: ApiContext): Promise<boolean | null> {
  try {
    if (ctx.credential.kind === "token") {
      const token = parseBearerToken(request.headers.get("authorization"));
      return token !== null && (await authenticateApiToken(token)) !== null;
    }
    const credential = parseApiKeyCredential(request.headers);
    return credential.kind === "apiKey" && (await authenticateApiKey(credential.key)) !== null;
  } catch {
    return null;
  }
}

/** Same as requireApiUser, plus 403 unless the account may do `permission`
 * (lib/users/permissions.ts): always the admin, otherwise whoever has that
 * switch on — read fresh with the credential on every request. */
export async function requireApiPermission(request: Request, permission: Permission, message: string): Promise<ApiContext> {
  const ctx = await requireApiUser(request);
  if (!can(ctx.user, permission)) throw ApiError.of("forbidden", message);
  return ctx;
}

/** Same as requireApiUser, plus 403 forbidden unless the user is an admin. */
export async function requireApiAdmin(request: Request, message = "Only the admin can do this."): Promise<ApiContext> {
  const ctx = await requireApiUser(request);
  if (!ctx.user.isAdmin) throw ApiError.of("forbidden", message);
  return ctx;
}

/** requireApiAdmin, signed in with a device token — never an API key, even
 * though the key policy already refuses them here too. For API-key
 * management itself. */
export async function requireApiAdminSession(request: Request, message = "Only the admin can do this."): Promise<ApiContext> {
  const ctx = await requireApiAdmin(request, message);
  if (ctx.credential.kind !== "token") throw ApiError.of("forbidden", "API keys can't manage API keys.");
  return ctx;
}
