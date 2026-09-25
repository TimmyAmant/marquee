import { withApi } from "@/lib/api/handler";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { authResponseFor, readJellyfinCredentials } from "@/lib/api/routes/media-auth";
import { signInWithJellyfin } from "@/lib/auth/media-signin";
import { getClientIp } from "@/lib/rate-limit";
import type { AuthResponse } from "@/lib/api/types";

/** "Sign in with Jellyfin": `{ username, password, deviceName? }`, checked
 * against the admin's Jellyfin server (the password goes there and nowhere
 * else). Same answer as POST /auth/login; `401 invalid_credentials`, `403`
 * when there's no account and new accounts are off, `429` under the same
 * limits as password sign-in, `409` when Jellyfin isn't connected. */
export const POST = withApi(async (request): Promise<AuthResponse> => {
  const body = await readJsonBody(request);
  const { username, password } = readJellyfinCredentials(body);
  const { user } = unwrap(await signInWithJellyfin(username, password, getClientIp(request)));
  return authResponseFor(user, body.deviceName);
});
