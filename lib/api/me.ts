import { ApiError } from "@/lib/api/errors";
import { userDto } from "@/lib/api/users";
import { getLinkState } from "@/lib/auth/media-signin";
import type { ApiContext } from "@/lib/api/auth";
import type { Me, RequestQuota } from "@/lib/api/types";
import { getQuotas, type QuotaState } from "@/lib/requests/quota";

export function quotaDto(quota: QuotaState | null): RequestQuota | null {
  return quota ? { ...quota, nextSlotAt: quota.nextSlotAt?.toISOString() ?? null } : null;
}

/** GET /me's answer — also what the /me/links endpoints return, so a client
 * sees the new link state without a second request. */
export async function meDto(ctx: ApiContext): Promise<Me> {
  const { user } = ctx;
  const [libraryOwnerId, links, quotas] = await Promise.all([
    ctx.libraryOwnerId(),
    getLinkState(user.id),
    getQuotas(user.id),
  ]);
  if (!links) throw ApiError.of("unauthorized", "Sign in again — this session is missing, expired or revoked.");
  return {
    ...userDto(user, libraryOwnerId),
    autoApproveMovies: user.autoApproveMovies,
    autoApproveTv: user.autoApproveTv,
    createdAt: user.createdAt.toISOString(),
    linked: links.linked,
    hasPassword: links.hasPassword,
    requestLimits: { movie: quotaDto(quotas.movie), tv: quotaDto(quotas.tv) },
  };
}
