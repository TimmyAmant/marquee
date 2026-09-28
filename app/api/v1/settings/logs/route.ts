import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { msg } from "@/lib/api/errors";
import { invalid, queryInt } from "@/lib/api/request";
import { isLogLevel, type LogEntry } from "@/lib/logs/buffer";
import { logBuffer } from "@/lib/logs/capture";

/** Settings › Logs (admin, never an API key): the server's recent log lines,
 * oldest first, secrets masked. `?level=` the least severe to include
 * (debug, info, warn, error), `?q=` text to look for, `?after=` only lines
 * newer than that id (for polling), `?limit=` at most this many of the
 * newest (500 by default, 2000 at most). */
export const GET = withApi(async (request): Promise<{ results: LogEntry[]; latestId: number }> => {
  await requireApiAdmin(request, msg("server.onlyAdminLogs"));
  const url = new URL(request.url);
  const level = url.searchParams.get("level") ?? undefined;
  if (level !== undefined && !isLogLevel(level)) throw invalid(msg("server.logLevelInvalid"));
  const buffer = logBuffer();
  return {
    results: buffer.list({
      level,
      query: url.searchParams.get("q") ?? undefined,
      after: queryInt(url, "after", { min: 0 }),
      limit: queryInt(url, "limit", { min: 1, max: 2000 }),
    }),
    latestId: buffer.latestId,
  };
});
