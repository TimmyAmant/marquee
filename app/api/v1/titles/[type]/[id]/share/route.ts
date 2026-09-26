import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { parseTitleParams, type TitleParams } from "@/lib/api/routes/titles";
import { shareTitle } from "@/lib/sharing";
import type { ShareTitleResponse } from "@/lib/api/types";

/** "Send to a household member". Body: `{ "userIds": ["…"], "note": "…" }`
 * (note optional, plain text, up to 280 characters). Each of them gets a
 * `title_shared` notification. */
export const POST = withApi<TitleParams>(async (request, params): Promise<ShareTitleResponse> => {
  const ctx = await requireApiUser(request);
  const { mediaType, tmdbId } = parseTitleParams(params);
  const body = await readJsonBody(request);
  const { sharedWith } = unwrap(
    await shareTitle(ctx.user.id, mediaType, tmdbId, { userIds: body.userIds, note: body.note }),
  );
  return { ok: true, sharedWith };
});
