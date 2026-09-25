import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { meDto } from "@/lib/api/me";
import type { Me } from "@/lib/api/types";

export const GET = withApi(async (request): Promise<Me> => {
  const ctx = await requireApiUser(request);
  return meDto(ctx);
});
