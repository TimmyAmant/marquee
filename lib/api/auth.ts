import { ApiError } from "@/lib/api/errors";
import { canReviewRequests } from "@/lib/users/roles";
import { parseBearerToken } from "@/lib/api/tokens";
import { authenticateApiToken, type AuthenticatedToken } from "@/lib/api/token-store";
import { getLibraryOwnerUserId, type ViewerIdentity } from "@/lib/integrations/library-owner";

export type ApiUser = AuthenticatedToken["user"] & { isAdmin: boolean };

export type ApiContext = {
  tokenId: string;
  expiresAt: Date;
  user: ApiUser;
  /** Resolved on first use (it costs a few credential lookups) and memoized —
   * most endpoints need it, polling endpoints like the unread count don't. */
  libraryOwnerId: () => Promise<string>;
  /** The same "who's asking, whose library" shape web pages get from
   * getViewerContext(), for handing to shared page loaders. */
  viewer: () => Promise<Extract<ViewerIdentity, { userId: string }>>;
};

const UNAUTHORIZED_MESSAGE = "Sign in again — this session is missing, expired or revoked.";

/**
 * Bearer-token authentication for /api/v1 handlers: parses the Authorization
 * header, looks up the token hash, slides its expiry, and reads the user's
 * role fresh from `users`. Throws ApiError(401 unauthorized) on any failure.
 */
export async function requireApiUser(request: Request): Promise<ApiContext> {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) throw ApiError.of("unauthorized", UNAUTHORIZED_MESSAGE);

  const authenticated = await authenticateApiToken(token);
  if (!authenticated) throw ApiError.of("unauthorized", UNAUTHORIZED_MESSAGE);

  const user: ApiUser = { ...authenticated.user, isAdmin: authenticated.user.role === "admin" };

  let ownerPromise: Promise<string> | null = null;
  const libraryOwnerId = () => (ownerPromise ??= getLibraryOwnerUserId(user.id));

  return {
    tokenId: authenticated.tokenId,
    expiresAt: authenticated.expiresAt,
    user,
    libraryOwnerId,
    viewer: async () => ({ userId: user.id, isAdmin: user.isAdmin, libraryOwnerId: await libraryOwnerId() }),
  };
}

/** Same as requireApiUser, plus 403 unless the user works the review
 * queue: the admin or a trusted member (lib/users/roles.ts). */
export async function requireApiReviewer(request: Request, message = "Only an admin can review requests."): Promise<ApiContext> {
  const ctx = await requireApiUser(request);
  if (!canReviewRequests(ctx.user.role)) throw ApiError.of("forbidden", message);
  return ctx;
}

/** Same as requireApiUser, plus 403 forbidden unless the user is an admin. */
export async function requireApiAdmin(request: Request, message = "Only the admin can do this."): Promise<ApiContext> {
  const ctx = await requireApiUser(request);
  if (!ctx.user.isAdmin) throw ApiError.of("forbidden", message);
  return ctx;
}
