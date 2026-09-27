import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { fail, type CoreResult } from "@/lib/core-result";
import { LOCALES, matchLocale, parseLanguageInput, type Locale } from "@/lib/i18n/locales";

/**
 * The language an account reads Marquee in (users.language): one of
 * lib/i18n/locales.ts, or null to follow the browser or the app's system
 * language. Shared by Settings › Account › Appearance and PATCH /me.
 */

export async function setUserLanguage(
  userId: string,
  value: unknown,
  invalidMessage: string = `language must be null or one of ${LOCALES.join(", ")}.`,
): Promise<CoreResult<{ language: Locale | null }>> {
  const parsed = parseLanguageInput(value);
  if (!parsed.ok) return fail("invalid", invalidMessage);
  await db.update(users).set({ language: parsed.language }).where(eq(users.id, userId));
  return { ok: true, language: parsed.language };
}

/** The stored value as one of ours, for the API and the settings page. */
export function storedLanguage(value: string | null | undefined): Locale | null {
  return value ? matchLocale(value) : null;
}
