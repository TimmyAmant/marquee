import { redirect } from "next/navigation";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { getDiscoverLayout } from "@/lib/discover/layout";
import { getTraktClientId } from "@/lib/integrations/app-settings";
import { getDiscoverLocaleSettings } from "@/lib/discover/locale-settings";
import { MAX_CUSTOM_SHELVES } from "@/lib/discover/shelves";
import { DiscoverSettingsEditor } from "./discover-settings";
import { RegionLanguageSettings } from "./region-language-settings";
import { getT } from "@/lib/i18n/server";
import { languageName, regionName } from "@/lib/i18n/format";
import { SettingsHeader } from "@/components/settings/settings-ui";

export default async function DiscoverSettingsPage() {
  const viewer = await getViewerContext();
  if (!viewer.session || !viewer.isAdmin) redirect("/settings");
  const [shelves, traktClientId, locale] = await Promise.all([
    getDiscoverLayout(),
    getTraktClientId().catch(() => null),
    getDiscoverLocaleSettings(),
  ]);
  const t = await getT();

  return (
    <div>
      <SettingsHeader title={t("integrations.discoverTitle")} description={t("integrations.discoverIntro")} />
      <DiscoverSettingsEditor
        initial={shelves}
        traktConfigured={Boolean(traktClientId)}
        maxCustomShelves={MAX_CUSTOM_SHELVES}
      />
      {/* Named here, on the server: the browser's own country and
          language names can differ from Node's and break hydration. */}
      <RegionLanguageSettings
        initial={locale}
        regionNames={Object.fromEntries(locale.regions.map((code) => [code, regionName(t, code) ?? code]))}
        languageNames={Object.fromEntries(
          locale.languages.map((code) => [code, code === "any" ? t("integrations.anyLanguage") : (languageName(t, code) ?? code)]),
        )}
      />
    </div>
  );
}
