import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError, msg } from "@/lib/api/errors";
import { householdMember, titleCard } from "@/lib/api/mappers";
import { parseUuidSegment } from "@/lib/api/request";
import { quotaDto } from "@/lib/api/me";
import { canViewProfile, loadMemberProfile } from "@/lib/users/profile";
import type { MemberProfile } from "@/lib/api/types";

/** A member's profile (0.53+): who they are, their request counts and
 * limits, and their Plex Watchlist. Yours, or anyone's as the admin; 403
 * for someone else's otherwise. */
export const GET = withApi<{ id: string }>(async (request, params): Promise<MemberProfile> => {
  const ctx = await requireApiUser(request);
  const userId = parseUuidSegment(params.id, msg("server.accountNotFound"));
  if (!canViewProfile({ userId: ctx.user.id, isAdmin: ctx.user.isAdmin }, userId)) {
    throw ApiError.of("forbidden", msg("server.onlyOwnProfile"));
  }
  const profile = await loadMemberProfile(
    { userId: ctx.user.id, isAdmin: ctx.user.isAdmin, libraryOwnerId: await ctx.libraryOwnerId() },
    userId,
  );
  if (!profile) throw ApiError.of("not_found", msg("server.accountNotFound"));
  return {
    user: householdMember(profile.member, ctx.user.id),
    requests: profile.requests,
    requestLimits: { movie: quotaDto(profile.limits.movie), tv: quotaDto(profile.limits.tv) },
    watchlist: profile.watchlist?.map((item) => titleCard(item, { status: item.status ?? null, episodes: item.episodes })) ?? null,
  };
});
