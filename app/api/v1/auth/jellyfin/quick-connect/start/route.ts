import { withApi } from "@/lib/api/handler";
import { unwrap } from "@/lib/api/guards";
import { quickConnectStartDto } from "@/lib/api/routes/sso";
import { startQuickConnect } from "@/lib/auth/media-signin";
import { getClientIp } from "@/lib/rate-limit";
import type { QuickConnectStart } from "@/lib/api/types";

/** Starts a Jellyfin Quick Connect sign-in: show `code` (the person enters
 * it in a Jellyfin app they're signed in to), then poll POST
 * /auth/jellyfin/quick-connect/poll with `handle`. Public, rate-limited per
 * client address. `409 conflict` when Jellyfin isn't connected, the server
 * is Emby, or Quick Connect is switched off in Jellyfin. */
export const POST = withApi(async (request): Promise<QuickConnectStart> => {
  return quickConnectStartDto(unwrap(await startQuickConnect(getClientIp(request))));
});
