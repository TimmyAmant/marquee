import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { DEFAULT_LOCALE, parseLocale, resolveLocale, type Locale } from "@/lib/i18n/locales";
import { translatorFor } from "@/lib/i18n/catalog";
import type { Translator } from "@/lib/i18n/translator";
import { apiScope } from "@/lib/i18n/request-scope";

/**
 * The language of whoever this request is for: their account's choice
 * (users.language, read fresh into the session on every request — see the
 * jwt callback in auth.ts), else their browser's Accept-Language, else
 * English. Works in Server Components, Server Actions and Route Handlers;
 * outside a request (a background job) it's English — anything written for
 * a particular person there should use translatorForUser instead.
 *
 * The apps sign in with a token rather than the browser's session, so for
 * them it's the Accept-Language they send, which follows the language
 * they're shown in.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  // An app's request (lib/i18n/request-scope.ts): its account's choice,
  // else the Accept-Language it sent.
  const api = apiScope();
  if (api) return resolveLocale(api.language, api.acceptLanguage);

  let acceptLanguage: string | null;
  try {
    acceptLanguage = (await headers()).get("accept-language");
  } catch (error) {
    // Not in a request at all: a job, a test.
    unstable_rethrow(error);
    return DEFAULT_LOCALE;
  }
  let preferred: unknown = null;
  try {
    // Loaded when needed, which keeps next-auth out of everything that
    // only runs behind the API.
    const { auth } = await import("@/auth");
    preferred = (await auth())?.user?.language ?? null;
  } catch (error) {
    unstable_rethrow(error);
  }
  return resolveLocale(preferred, acceptLanguage);
});

/** `t` for this request's language: `const t = await getT()`. */
export async function getT(): Promise<Translator> {
  return translatorFor(await getLocale());
}

/** An account's own language, or null when it follows its browser. */
export async function languageOfUser(userId: string): Promise<Locale | null> {
  const [row] = await db.select({ language: users.language }).from(users).where(eq(users.id, userId)).limit(1);
  return parseLocale(row?.language);
}

/**
 * `t` for someone who isn't necessarily the one making this request — a
 * notification's recipient. Their own choice if they made one; otherwise the
 * household's default (the admin's language), then English. Not the
 * current request's browser: that's someone else's.
 */
export async function translatorForUser(userId: string | null | undefined): Promise<Translator> {
  if (!userId) return translatorFor(await householdLocale());
  return translatorFor((await languageOfUser(userId)) ?? (await householdLocale()));
}

/** Translators for several recipients at once, one query. */
export async function translatorsForUsers(userIds: readonly string[]): Promise<Map<string, Translator>> {
  const result = new Map<string, Translator>();
  if (userIds.length === 0) return result;
  const rows = await db
    .select({ id: users.id, language: users.language })
    .from(users)
    .where(inArray(users.id, [...new Set(userIds)]));
  const fallback = await householdLocale();
  for (const row of rows) result.set(row.id, translatorFor(parseLocale(row.language) ?? fallback));
  for (const id of userIds) if (!result.has(id)) result.set(id, translatorFor(fallback));
  return result;
}

/**
 * What the household channels (Discord, ntfy, a webhook, the admin's email)
 * are written in: the admin's language, else English.
 */
export async function householdLocale(): Promise<Locale> {
  const [row] = await db
    .select({ language: users.language })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);
  return parseLocale(row?.language) ?? DEFAULT_LOCALE;
}

export async function householdT(): Promise<Translator> {
  return translatorFor(await householdLocale());
}
