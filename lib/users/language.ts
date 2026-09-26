import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { fail, type CoreResult } from "@/lib/core-result";
import { LOCALES, matchLocale, type Locale } from "@/lib/i18n/locales";

/**
 * The language an account reads Marquee in (users.language): one of
 * lib/i18n/locales.ts, or null to follow the browser or the app's system
 * language. Shared by Settings › Account › Appearance and PATCH /me.
 */

/** A submitted language: null/"" to follow the browser, or exactly one of
 * ours (any case). Anything else — including a regional variant we don't
 * have, like "es-MX" — is refused rather than quietly saved as something
 * other than what was asked for. */
export function parseLanguageInput(value: unknown): { ok: true; language: Locale | null } | { ok: false } {
  if (value === null || value === undefined || value === "") return { ok: true, language: null };
  if (typeof value !== "string") return { ok: false };
  const language = LOCALES.find((locale) => locale.toLowerCase() === value.trim().replace(/_/g, "-").toLowerCase());
  return language ? { ok: true, language } : { ok: false };
}

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
