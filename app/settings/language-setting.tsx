"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useT } from "@/lib/i18n/client";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/lib/i18n/locales";
import { setLanguageAction } from "./language-actions";
import { SettingRow } from "@/components/settings/settings-ui";

/**
 * Settings › Account › Appearance: the language this account reads Marquee
 * in, on every device and in its notifications (users.language). Automatic
 * follows the browser. Each language is listed in its own words, so it can
 * be found whatever the page is in now.
 */
export function LanguageSetting({ initial }: { initial: Locale | null }) {
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState<string>(initial ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(next: string) {
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await setLanguageAction(next || null);
      if (result.error) {
        setValue(previous);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <SettingRow
      label={t("settings.languageLabel")}
      help={
        <>
          {t("settings.languageHelp")}
          {error && (
            <span role="alert" className="mt-1 block text-red-400">
              {error}
            </span>
          )}
        </>
      }
      htmlFor="language-select"
    >
      <select
        id="language-select"
        value={value}
        disabled={pending}
        onChange={(event) => choose(event.target.value)}
        className="w-full rounded-xl border border-border bg-bg-0 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none disabled:opacity-60 sm:w-64"
      >
        <option value="">{t("settings.languageAutomatic")}</option>
        {LOCALES.map((locale) => (
          <option key={locale} value={locale} lang={locale}>
            {LOCALE_NAMES[locale]}
          </option>
        ))}
      </select>
    </SettingRow>
  );
}
