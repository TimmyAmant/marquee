import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadIntegrationsPage } from "@/lib/pages/settings";
import { TmdbSettingsForm } from "@/components/tmdb-settings-form";
import { TraktConnectCard } from "@/components/trakt-connect-card";
import { TvdbConnectCard } from "@/components/tvdb-connect-card";
import { OmdbConnectCard } from "@/components/omdb-connect-card";
import { ApiKeysCard } from "@/components/api-keys-card";
import { SeerrImportCard } from "@/components/seerr-import-card";
import { listApiKeys } from "@/lib/api/api-key-store";
import { listHouseholdMembersFor } from "@/lib/users/household";
import { getT } from "@/lib/i18n/server";
import { SettingsHeader, SettingsSection } from "@/components/settings/settings-ui";

/** Settings › General, the admin's: where Marquee's metadata comes from,
 * API keys for scripts and dashboards, and moving over from Seerr. */
export default async function GeneralSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/settings");

  const [{ tmdb, traktConnected, tvdbConnected, omdbConnected }, apiKeys, household, t] = await Promise.all([
    loadIntegrationsPage(session.user.id),
    listApiKeys(),
    listHouseholdMembersFor({ userId: session.user.id, isAdmin: true }),
    getT(),
  ]);

  return (
    <div>
      <SettingsHeader title={t("nav.settingsGeneral")} description={t("settings.generalIntro")} />

      <SettingsSection title={t("integrations.sectionMetadata")}>
        <TmdbSettingsForm savedInSettings={tmdb.savedInSettings} configuredFromEnv={tmdb.configuredFromEnv} />
        <TraktConnectCard connected={traktConnected} />
        <TvdbConnectCard connected={tvdbConnected} />
        <OmdbConnectCard connected={omdbConnected} />
      </SettingsSection>

      <SettingsSection title={t("integrations.sectionApiAccess")}>
        <ApiKeysCard
          initialKeys={apiKeys}
          members={household
            .filter((member) => member.id !== session.user.id)
            .map((member) => ({ id: member.id, label: member.displayName || member.username }))}
        />
      </SettingsSection>

      <SettingsSection title={t("integrations.sectionMigrate")}>
        <SeerrImportCard />
      </SettingsSection>
    </div>
  );
}
