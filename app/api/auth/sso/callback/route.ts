import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { SSO_COOKIE, SSO_COOKIE_PATH } from "@/lib/auth/sso/flows";
import { completeSsoCallback } from "@/lib/auth/sso/signin";
import { signInWithTicket } from "@/lib/auth/web-session";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Where the identity provider sends the browser back to — the redirect URI
 * to register with it, exactly. Takes `state` + `code` (or `error`), checks
 * them against the flow this browser started (lib/auth/sso/signin.ts), and
 * then: signs the browser in (the login page's button), links the account
 * (Settings), or finishes an app's sign-in and says to go back to the app.
 * Failures come back as fixed codes the next page turns into words.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const cookieStore = await cookies();
  const session = await auth();

  const outcome = await completeSsoCallback({
    state: params.get("state"),
    code: params.get("code"),
    error: params.get("error"),
    cookie: cookieStore.get(SSO_COOKIE)?.value ?? null,
    ip: getClientIp(request),
    sessionUserId: session?.user?.id ?? null,
  });

  // The flow is finished either way (or wasn't this browser's).
  if (outcome.kind !== "unknown") cookieStore.set(SSO_COOKIE, "", { path: SSO_COOKIE_PATH, maxAge: 0 });

  let destination: string;
  switch (outcome.kind) {
    case "web_sign_in":
      if (outcome.ok) {
        await signInWithTicket(outcome.userId, outcome.remember);
        destination = "/";
      } else {
        destination = `/login?sso=${outcome.code}`;
      }
      break;
    case "web_link":
      destination = outcome.ok ? "/settings?sso=linked" : `/settings?sso=${outcome.code}`;
      break;
    case "app_sign_in":
      destination = `/login/sso/done?result=${outcome.ok ? "signed_in" : outcome.code}`;
      break;
    case "app_link":
      destination = `/login/sso/done?result=${outcome.ok ? "linked" : outcome.code}`;
      break;
    default:
      destination = `/login?sso=${outcome.ok ? "failed" : outcome.code}`;
  }
  redirect(destination);
}
