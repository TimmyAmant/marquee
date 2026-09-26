import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { testSsoIssuer } from "@/lib/auth/sso/config";
import type { SsoTestResult } from "@/lib/api/types";

/** "Test" (admin): body `{ issuer }` — fetches and checks the provider's
 * discovery document without saving anything. `400` for a URL that isn't
 * one, `502 upstream` with the reason when it doesn't check out. */
export const POST = withApi(async (request): Promise<SsoTestResult> => {
  await requireApiAdmin(request, "Only the admin can change sign-in settings.");
  const { result } = unwrap(await testSsoIssuer((await readJsonBody(request)).issuer));
  return result;
});
