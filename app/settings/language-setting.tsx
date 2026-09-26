"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useT } from "@/lib/i18n/client";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/lib/i18n/locales";
import { setLanguageAction } from "./language-actions";

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
    <div className="p-6">
      <label htmlFor="language-select" className="text-sm font-medium text-text-primary">
        {t("settings.languageLabel")}
      </label>
      <p className="mt-1 text-sm text-text-secondary">{t("settings.languageHelp")}</p>
      <select
        id="language-select"
        value={value}
        disabled={pending}
        onChange={(event) => choose(event.target.value)}
        className="mt-4 w-full rounded-xl border border-border bg-bg-0 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none disabled:opacity-60"
      >
        <option value="">{t("settings.languageAutomatic")}</option>
        {LOCALES.map((locale) => (
          <option key={locale} value={locale} lang={locale}>
            {LOCALE_NAMES[locale]}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
