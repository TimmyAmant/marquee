import Link from "next/link";
import { getT } from "@/lib/i18n/server";

/** Settings › Integrations › Coming from Seerr?: the way to the importer
 * (app/settings/integrations/import-seerr). */
export async function SeerrImportCard() {
  const t = await getT();
  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-6">
      <h3 className="font-display text-xl text-text-primary">{t("integrations.seerrCardTitle")}</h3>
      <p className="mt-1 text-xs text-text-muted">{t("integrations.seerrCardIntro")}</p>
      <Link
        href="/settings/integrations/import-seerr"
        className="mt-4 inline-block rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent"
      >
        {t("integrations.seerrOpenImport")}
      </Link>
    </div>
  );
}
