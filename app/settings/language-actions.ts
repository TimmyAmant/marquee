"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getT } from "@/lib/i18n/server";
import { setUserLanguage } from "@/lib/users/language";

/** Settings › Account › Appearance: the account's language, or null to
 * follow the browser. The whole site re-renders in it. */
export async function setLanguageAction(language: string | null): Promise<{ error?: string }> {
  const session = await auth();
  const t = await getT();
  if (!session?.user) return { error: t("server.signInAgain") };
  const result = await setUserLanguage(session.user.id, language, t("settings.languageInvalid"));
  if (!result.ok) return { error: result.error };
  revalidatePath("/", "layout");
  return {};
}
