"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { isLogLevel, type LogEntry } from "@/lib/logs/buffer";
import { logBuffer } from "@/lib/logs/capture";
import { getT } from "@/lib/i18n/server";

/** Settings › Logs' refresh: the lines after `after` (all of them when it's
 * not given) that pass the filter — the same as GET /api/v1/settings/logs. */
export async function getLogsAction(filter: {
  level?: string;
  query?: string;
  after?: number;
}): Promise<{ ok: true; results: LogEntry[]; latestId: number } | { ok: false; error: string }> {
  const admin = await requireAdmin((await getT())("server.onlyAdminLogs"));
  if (!admin.ok) return { ok: false, error: admin.error };
  const buffer = logBuffer();
  return {
    ok: true,
    results: buffer.list({
      level: isLogLevel(filter.level) ? filter.level : undefined,
      query: typeof filter.query === "string" ? filter.query.slice(0, 200) : undefined,
      after: Number.isSafeInteger(filter.after) ? filter.after : undefined,
    }),
    latestId: buffer.latestId,
  };
}
