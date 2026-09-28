import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { SettingRow, SettingsGroup } from "@/components/settings/settings-ui";

/** Settings › General › Coming from Seerr?: the way to the importer
 * (app/settings/general/import-seerr). */
export async function SeerrImportCard() {
  const t = await getT();
  return (
    <SettingsGroup>
      <SettingRow label={t("integrations.seerrCardTitle")} help={t("integrations.seerrCardIntro")}>
        <Link
          href="/settings/general/import-seerr"
          className="whitespace-nowrap rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent"
        >
          {t("integrations.seerrOpenImport")}
        </Link>
      </SettingRow>
    </SettingsGroup>
  );
}
