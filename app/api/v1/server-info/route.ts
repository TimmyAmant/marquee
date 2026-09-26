import { withApi } from "@/lib/api/handler";
import { hasAnyUser } from "@/lib/auth/setup";
import { getSignInMethods } from "@/lib/auth/media-signin";
import { APP_VERSION } from "@/lib/api/version";
import type { ServerInfo, SignInMethods } from "@/lib/api/types";

export const dynamic = "force-dynamic";

const DB_CHECK_TIMEOUT_MS = 3000;

/** Public discovery: identifies a Marquee server, whether first-run setup
 * is done, and which sign-in methods to offer. Deliberately cheap — a few
 * small queries, no calls out to integrations — and still a 200 (status
 * "degraded", password sign-in only) when the database is unreachable or
 * slow to answer. Which methods exist is safe to tell anyone: the login
 * page shows the same buttons. */
export const GET = withApi(async (): Promise<ServerInfo> => {
  let setupComplete: boolean | null = null;
  let signIn: SignInMethods = {
    password: true,
    plex: false,
    jellyfin: false,
    jellyfinName: "Jellyfin",
    signup: false,
    quickConnect: false,
    sso: null,
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    [setupComplete, signIn] = await Promise.race([
      Promise.all([hasAnyUser(), getSignInMethods()]),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("database check timed out")), DB_CHECK_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    console.error("[api/v1] server-info: database check failed:", err);
    setupComplete = null;
  } finally {
    if (timer) clearTimeout(timer);
  }

  return {
    app: "marquee",
    apiVersion: 1,
    version: APP_VERSION,
    setupComplete,
    status: setupComplete === null ? "degraded" : "ok",
    signIn,
  };
});
