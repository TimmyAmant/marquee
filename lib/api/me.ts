import { ApiError } from "@/lib/api/errors";
import { userDto } from "@/lib/api/users";
import { getLinkState } from "@/lib/auth/media-signin";
import type { ApiContext } from "@/lib/api/auth";
import type { Me } from "@/lib/api/types";

/** GET /me's answer — also what the /me/links endpoints return, so a client
 * sees the new link state without a second request. */
export async function meDto(ctx: ApiContext): Promise<Me> {
  const { user } = ctx;
  const [libraryOwnerId, links] = await Promise.all([ctx.libraryOwnerId(), getLinkState(user.id)]);
  if (!links) throw ApiError.of("unauthorized", "Sign in again — this session is missing, expired or revoked.");
  return {
    ...userDto(user, libraryOwnerId),
    autoApproveMovies: user.autoApproveMovies,
    autoApproveTv: user.autoApproveTv,
    createdAt: user.createdAt.toISOString(),
    linked: links.linked,
    hasPassword: links.hasPassword,
  };
}
