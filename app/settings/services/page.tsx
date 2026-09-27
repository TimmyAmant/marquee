import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { loadIntegrationsPage } from "@/lib/pages/settings";
import { webhookBaseUrl } from "@/lib/integrations/webhook-urls";
import { ArrServersCard } from "@/components/arr-servers-card";
import { toArrServerDto } from "@/lib/arr/servers";
import { WebhookSettingsCard } from "@/components/webhook-settings-card";
import { getT } from "@/lib/i18n/server";
import { SettingsHeader, SettingsSection } from "@/components/settings/settings-ui";

/** Settings › Services, the admin's: every Sonarr and Radarr (4K ones
 * too) as a tile, and the webhook they tell Marquee what they did with. */
export default async function ServicesSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/settings");

  const [{ arrServers, webhookSecret }, headerList, t] = await Promise.all([
    loadIntegrationsPage(session.user.id),
    headers(),
    getT(),
  ]);
  const baseUrl = webhookBaseUrl(headerList);
  // Only what a client may see: toArrServerDto drops the API key.
  const servers = arrServers.map((server) => toArrServerDto(server, baseUrl));

  return (
    <div>
      <SettingsHeader title={t("nav.settingsServices")} description={t("integrations.arrIntro")} />

      <ArrServersCard servers={servers} />

      <SettingsSection>
        <WebhookSettingsCard
          userId={session.user.id}
          initialSecret={webhookSecret}
          baseUrl={baseUrl}
          fourK={{
            radarr: arrServers.some((s) => s.kind === "radarr" && s.is4k),
            sonarr: arrServers.some((s) => s.kind === "sonarr" && s.is4k),
          }}
        />
      </SettingsSection>
    </div>
  );
}
