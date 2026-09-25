import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { readJsonBody, requiredBoolean } from "@/lib/api/request";
import { getMediaServerSignup, setMediaServerSignup } from "@/lib/auth/media-signin";
import type { SignInSettings } from "@/lib/api/types";

const FORBIDDEN = "Only the admin can change sign-in settings.";

/** "New accounts from Plex/Jellyfin sign-in" (admin). */
export const GET = withApi(async (request): Promise<SignInSettings> => {
  await requireApiAdmin(request, FORBIDDEN);
  return { mediaServerSignup: await getMediaServerSignup() };
});

/** Body `{ mediaServerSignup: boolean }`; answers the saved setting. */
export const PUT = withApi(async (request): Promise<SignInSettings> => {
  await requireApiAdmin(request, FORBIDDEN);
  const value = requiredBoolean(await readJsonBody(request), "mediaServerSignup");
  await setMediaServerSignup(value);
  return { mediaServerSignup: await getMediaServerSignup() };
});
