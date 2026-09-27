import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { meDto } from "@/lib/api/me";
import { readJsonBody } from "@/lib/api/request";
import type { Me } from "@/lib/api/types";
import { getT } from "@/lib/i18n/server";
import { setUserLanguage } from "@/lib/users/language";
import { setScopedLanguage } from "@/lib/i18n/request-scope";

export const GET = withApi(async (request): Promise<Me> => {
  const ctx = await requireApiUser(request);
  return meDto(ctx);
});

/** `{ "language": "fr" | null }`: the account's own preferences (0.50+).
 * Only what's sent changes; answers the whole of GET /me. */
export const PATCH = withApi(async (request): Promise<Me> => {
  const ctx = await requireApiUser(request);
  const body = await readJsonBody(request);
  if ("language" in body) {
    const t = await getT();
    const { language } = unwrap(await setUserLanguage(ctx.user.id, body.language, t("server.languageInvalid")));
    ctx.user.language = language;
    // The answer (and anything after it) is in the new language.
    setScopedLanguage(language);
  }
  return meDto(ctx);
});
