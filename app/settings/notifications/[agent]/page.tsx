import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadIntegrationsPage } from "@/lib/pages/settings";
import { HouseholdEventsCard } from "@/components/household-events-card";
import { getHouseholdEvents } from "@/lib/notifications/preferences";
import { DiscordConnectCard } from "@/components/discord-connect-card";
import { NtfyConnectCard } from "@/components/ntfy-connect-card";
import { NotificationChannelCards } from "@/components/notification-channel-cards";
import { WebhookConnectCard } from "@/components/webhook-connect-card";
import { SettingsSection } from "@/components/settings/settings-ui";
import { isNotificationAgent } from "@/lib/settings/tabs";

/** Settings › Notifications › one household channel (the admin's): what
 * the channels post, or one channel's own form. */
export default async function NotificationAgentPage({ params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params;
  if (!isNotificationAgent(agent)) notFound();
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/settings/notifications");

  if (agent === "household") {
    const events = await getHouseholdEvents();
    return (
      <SettingsSection>
        <HouseholdEventsCard initial={events} />
      </SettingsSection>
    );
  }

  const { discordConnected, ntfyConnected, genericWebhookConnected, channels } = await loadIntegrationsPage(
    session.user.id,
  );
  return (
    <SettingsSection>
      {agent === "discord" && <DiscordConnectCard connected={discordConnected} />}
      {agent === "ntfy" && <NtfyConnectCard connected={ntfyConnected} />}
      {(agent === "telegram" ||
        agent === "pushover" ||
        agent === "email" ||
        agent === "gotify" ||
        agent === "slack" ||
        agent === "pushbullet") && (
        <NotificationChannelCards channels={channels} only={agent} />
      )}
      {agent === "webhook" && <WebhookConnectCard connected={genericWebhookConnected} />}
    </SettingsSection>
  );
}
