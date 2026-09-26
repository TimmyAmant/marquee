import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasAnyUser } from "@/lib/auth/setup";
import { getSignInMethods } from "@/lib/auth/media-signin";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (!(await hasAnyUser())) redirect("/setup");

  const session = await auth();
  if (session?.user) redirect("/");

  // Only the methods that can work right now: Plex/Jellyfin sign-in need the
  // admin's server connected in Settings → Integrations.
  const methods = await getSignInMethods();
  return (
    <LoginForm methods={{ plex: methods.plex, jellyfin: methods.jellyfin, jellyfinName: methods.jellyfinName }} />
  );
}
