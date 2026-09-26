import { withApi } from "@/lib/api/handler";
import { msg } from "@/lib/api/errors";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { getNotFoundAfterHours, saveNotFoundAfterHours } from "@/lib/requests/not-found";
import type { NotFoundSettings } from "@/lib/api/types";

const FORBIDDEN = msg("server.onlyAdminChangeThis");

/** How long after approval an unfound request counts as "Can't find" (0.46+). */
export const GET = withApi(async (request): Promise<NotFoundSettings> => {
  await requireApiAdmin(request, FORBIDDEN);
  return { afterHours: await getNotFoundAfterHours() };
});

/** Body `{ afterHours: 1…720 }`; answers the saved setting. */
export const PUT = withApi(async (request): Promise<NotFoundSettings> => {
  await requireApiAdmin(request, FORBIDDEN);
  const saved = unwrap(await saveNotFoundAfterHours((await readJsonBody(request)).afterHours));
  return { afterHours: saved.afterHours };
});
