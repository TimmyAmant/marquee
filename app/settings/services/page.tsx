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
import { OverrideRulesCard } from "@/components/override-rules-card";
import { listOverrideRules } from "@/lib/arr/override-rules-server";
import { getMovieGenres, getTvGenres } from "@/lib/tmdb/client";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { asc } from "drizzle-orm";

/** Settings › Services, the admin's: every Sonarr and Radarr (4K ones
 * too) as a tile, and the webhook they tell Marquee what they did with. */
export default async function ServicesSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/settings");

  const [{ arrServers, webhookSecret }, headerList, t, rules, members, movieGenres, tvGenres] = await Promise.all([
    loadIntegrationsPage(session.user.id),
    headers(),
    getT(),
    listOverrideRules(session.user.id),
    db
      .select({ id: users.id, username: users.username, displayName: users.displayName })
      .from(users)
      .orderBy(asc(users.username)),
    // Genre names for the override rules; without TMDb the rules still work.
    getMovieGenres().then((r) => r.genres).catch(() => []),
    getTvGenres().then((r) => r.genres).catch(() => []),
  ]);
  const baseUrl = webhookBaseUrl(headerList);
  // Only what a client may see: toArrServerDto drops the API key.
  const servers = arrServers.map((server) => toArrServerDto(server, baseUrl));

  return (
    <div>
      <SettingsHeader title={t("nav.settingsServices")} description={t("integrations.arrIntro")} />

      <ArrServersCard servers={servers} />

      <OverrideRulesCard
        rules={rules}
        servers={servers.map((s) => ({ id: s.id, name: s.name, kind: s.kind, is4k: s.is4k }))}
        members={members.map((m) => ({ id: m.id, name: m.displayName || m.username }))}
        genres={{
          movie: movieGenres.map((g) => ({ id: g.id, name: g.name })),
          tv: tvGenres.map((g) => ({ id: g.id, name: g.name })),
        }}
      />

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
