import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasAnyUser } from "@/lib/auth/setup";
import { getSignInMethods } from "@/lib/auth/media-signin";
import { parseSsoErrorCode, ssoErrorMessage } from "@/lib/auth/sso/messages";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ sso?: string | string[] }> }) {
  if (!(await hasAnyUser())) redirect("/setup");

  const session = await auth();
  if (session?.user) redirect("/");

  // Only the methods that can work right now: Plex/Jellyfin sign-in need the
  // admin's server connected in Settings → Integrations, SSO its settings.
  const methods = await getSignInMethods();
  // Back from a single sign-on that didn't work: a fixed code, never text
  // from the URL itself (lib/auth/sso/messages.ts).
  const ssoError = parseSsoErrorCode((await searchParams).sso);
  return (
    <LoginForm
      methods={{
        plex: methods.plex,
        jellyfin: methods.jellyfin,
        jellyfinName: methods.jellyfinName,
        signup: methods.signup,
        quickConnect: methods.quickConnect,
        sso: methods.sso,
      }}
      ssoError={ssoError ? ssoErrorMessage(ssoError, methods.sso?.name ?? "single sign-on") : null}
    />
  );
}
