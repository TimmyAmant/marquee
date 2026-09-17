import { withApi } from "@/lib/api/handler";
import { hasAnyUser } from "@/lib/auth/setup";
import { APP_VERSION } from "@/lib/api/version";
import type { ServerInfo } from "@/lib/api/types";

export const dynamic = "force-dynamic";

const DB_CHECK_TIMEOUT_MS = 3000;

/** Public discovery: identifies a Marquee server and whether first-run setup
 * is done. Deliberately cheap — one query, no integrations — and still a 200
 * (status "degraded") when the database is unreachable or slow to answer. */
export const GET = withApi(async (): Promise<ServerInfo> => {
  let setupComplete: boolean | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    setupComplete = await Promise.race([
      hasAnyUser(),
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
  };
});
