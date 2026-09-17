import { withApi } from "@/lib/api/handler";
import { readJsonBody } from "@/lib/api/request";
import { unwrap } from "@/lib/api/guards";
import { normalizeDeviceName } from "@/lib/api/tokens";
import { issueApiToken } from "@/lib/api/token-store";
import { userDto } from "@/lib/api/users";
import { createFirstAdmin, setupClientIp } from "@/lib/auth/setup";
import type { AuthResponse } from "@/lib/api/types";

/** First-run setup from a native client: creates the first (admin) account
 * exactly like the web /setup page (same validation, same rate limit bucket)
 * and signs this device in. 409 setup_complete once any account exists. */
export const POST = withApi(async (request): Promise<AuthResponse> => {
  const body = await readJsonBody(request);

  const { user } = unwrap(
    await createFirstAdmin(
      {
        username: body.username,
        password: body.password,
        // The web form sends an empty field as "no display name".
        displayName: body.displayName || undefined,
      },
      setupClientIp(request.headers),
    ),
  );

  const issued = await issueApiToken(user.id, normalizeDeviceName(body.deviceName));

  return {
    token: issued.token,
    expiresAt: issued.expiresAt.toISOString(),
    // The first account is the admin and owns the (not yet connected) library.
    user: userDto(user, user.id),
  };
});
