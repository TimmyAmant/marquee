import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SeerrImportWizard } from "@/components/seerr-import-wizard";
import { isTmdbConfigured } from "@/lib/tmdb/client";
import { getT } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/rich";

const GUIDE_URL = "https://github.com/TimmyAmant/marquee/blob/main/docs/migrating-from-seerr.md";

/** Settings › Integrations › Import from Seerr: connect, preview, choose,
 * run — lib/import/seerr, shared with /api/v1/settings/import/seerr. */
export default async function ImportFromSeerrPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/settings");
  const [t, tmdbConfigured] = await Promise.all([getT(), isTmdbConfigured()]);

  return (
    <div>
      <Link href="/settings/integrations" className="text-sm text-text-muted hover:text-text-primary">
        {t("integrations.seerrBackToIntegrations")}
      </Link>
      <h2 className="mt-3 font-display text-xl text-text-primary">{t("integrations.seerrPageTitle")}</h2>
      <p className="mt-2 text-sm text-text-secondary">
        {rich(t("integrations.seerrPageIntro"), {
          link: (chunks) => (
            <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              {chunks}
            </a>
          ),
        })}
      </p>
      <div className="mt-6">
        <SeerrImportWizard tmdbConfigured={tmdbConfigured} />
      </div>
    </div>
  );
}
