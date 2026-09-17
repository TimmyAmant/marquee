import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { userDto } from "@/lib/api/users";
import type { Me } from "@/lib/api/types";

export const GET = withApi(async (request): Promise<Me> => {
  const ctx = await requireApiUser(request);
  const { user } = ctx;
  return {
    ...userDto(user, await ctx.libraryOwnerId()),
    autoApproveMovies: user.autoApproveMovies,
    autoApproveTv: user.autoApproveTv,
    createdAt: user.createdAt.toISOString(),
  };
});
