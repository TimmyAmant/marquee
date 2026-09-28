import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SeerrImportWizard } from "@/components/seerr-import-wizard";
import { isTmdbConfigured } from "@/lib/tmdb/client";
import { getT } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/rich";
import { SettingsHeader } from "@/components/settings/settings-ui";

const GUIDE_URL = "https://github.com/TimmyAmant/marquee/blob/main/docs/migrating-from-seerr.md";

/** Settings › General › Import from Seerr: connect, preview, choose,
 * run — lib/import/seerr, shared with /api/v1/settings/import/seerr. */
export default async function ImportFromSeerrPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/settings");
  const [t, tmdbConfigured] = await Promise.all([getT(), isTmdbConfigured()]);

  return (
    <div>
      <Link href="/settings/general" className="text-sm text-text-muted hover:text-text-primary">
        {t("integrations.seerrBackToGeneral")}
      </Link>
      <div className="mt-3">
        <SettingsHeader
          title={t("integrations.seerrPageTitle")}
          description={rich(t("integrations.seerrPageIntro"), {
            link: (chunks) => (
              <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                {chunks}
              </a>
            ),
          })}
        />
      </div>
      <div className="mt-8">
        <SeerrImportWizard tmdbConfigured={tmdbConfigured} />
      </div>
    </div>
  );
}
