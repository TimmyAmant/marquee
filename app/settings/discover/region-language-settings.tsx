"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveDiscoverLocaleAction } from "./actions";
import type { DiscoverLocaleSettings } from "@/lib/discover/locale-settings";
import { useT } from "@/lib/i18n/client";

const selectClass =
  "rounded-lg border border-border bg-bg-0 px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent";

/**
 * Settings › Discover › Region & language: the country "Currently
 * streaming on" (and a movie's release dates) are for, and — like Seerr's
 * Discover Region / Discover Language — the region and original language
 * TMDb's Popular and Upcoming rows are filtered to. Saves as each is
 * changed.
 */
export function RegionLanguageSettings({
  initial,
  regionNames,
  languageNames,
}: {
  initial: DiscoverLocaleSettings;
  /** Code to name, in the reader's language (worked out on the server). */
  regionNames: Record<string, string>;
  languageNames: Record<string, string>;
}) {
  const t = useT();
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(patch: Record<string, string | null>) {
    setError(null);
    startTransition(async () => {
      const result = await saveDiscoverLocaleAction(patch);
      if (result.error) setError(result.error);
      if (result.settings) {
        setSettings(result.settings);
        router.refresh();
      }
    });
  }

  const region = (code: string) => `${regionNames[code] ?? code} (${code})`;
  const language = (code: string) => languageNames[code] ?? code;

  return (
    <div className="mt-6 max-w-md rounded-2xl border border-border bg-bg-1 p-6">
      <h3 className="font-display text-lg text-text-primary">{t("integrations.regionLanguageTitle")}</h3>
      <p className="mt-1 text-sm text-text-secondary">{t("integrations.regionLanguageIntro")}</p>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("integrations.streamingRegionLabel")}
          <select
            className={selectClass}
            value={settings.streamingRegion ?? ""}
            disabled={pending}
            onChange={(e) => save({ streamingRegion: e.target.value || null })}
          >
            <option value="">{t("integrations.regionAutomatic", { region: region(settings.effective.streamingRegion) })}</option>
            {settings.regions.map((code) => (
              <option key={code} value={code}>
                {region(code)}
              </option>
            ))}
          </select>
          <span className="text-xs text-text-muted">{t("integrations.streamingRegionHelp")}</span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("integrations.discoverRegionLabel")}
          <select
            className={selectClass}
            value={settings.discoverRegion ?? ""}
            disabled={pending}
            onChange={(e) => save({ discoverRegion: e.target.value || null })}
          >
            <option value="">{t("integrations.discoverRegionWorldwide")}</option>
            {settings.regions.map((code) => (
              <option key={code} value={code}>
                {region(code)}
              </option>
            ))}
          </select>
          <span className="text-xs text-text-muted">{t("integrations.discoverRegionHelp")}</span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("integrations.discoverLanguageLabel")}
          <select
            className={selectClass}
            value={settings.discoverLanguage ?? "en"}
            disabled={pending}
            onChange={(e) => save({ discoverLanguage: e.target.value === "en" ? null : e.target.value })}
          >
            {settings.languages.map((code) => (
              <option key={code} value={code}>
                {language(code)}
              </option>
            ))}
          </select>
          <span className="text-xs text-text-muted">{t("integrations.discoverLanguageHelp")}</span>
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
