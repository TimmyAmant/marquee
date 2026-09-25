import { withApi } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { readJsonBody, invalid } from "@/lib/api/request";
import { normalizeDeviceName } from "@/lib/api/tokens";
import { issueApiToken } from "@/lib/api/token-store";
import { userDto } from "@/lib/api/users";
import { authenticateWithPassword } from "@/lib/auth/password-login";
import { getClientIp } from "@/lib/rate-limit";
import { getLibraryOwnerUserId } from "@/lib/integrations/library-owner";
import type { AuthResponse } from "@/lib/api/types";

/** Exchanges a username/password for a device bearer token. Shares the web
 * sign-in's rate limits (per-address refusal, per-username backoff) — see
 * authenticateWithPassword. */
export const POST = withApi(async (request): Promise<AuthResponse> => {
  const body = await readJsonBody(request);
  const username = body.username;
  const password = body.password;
  if (typeof username !== "string" || !username || typeof password !== "string" || !password) {
    throw invalid("Enter your username and password.");
  }

  const result = await authenticateWithPassword(username, password, getClientIp(request));
  if (!result.ok) {
    if (result.reason === "rate_limited") {
      throw ApiError.of("rate_limited", "Too many attempts. Try again in a few minutes.");
    }
    throw ApiError.of("invalid_credentials", "Incorrect username or password");
  }

  const { user } = result;
  const [issued, libraryOwnerId] = await Promise.all([
    issueApiToken(user.id, normalizeDeviceName(body.deviceName)),
    getLibraryOwnerUserId(user.id),
  ]);

  return {
    token: issued.token,
    expiresAt: issued.expiresAt.toISOString(),
    user: userDto(user, libraryOwnerId),
  };
});
