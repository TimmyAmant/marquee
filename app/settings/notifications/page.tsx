import { PushSettings } from "../push-settings";
import { PersonalNotifications } from "../personal-notifications";
import { SettingsSection } from "@/components/settings/settings-ui";
import { getT } from "@/lib/i18n/server";

/** Settings › Notifications › Yours: this browser's notifications, your
 * own channels, and what you hear about where. */
export default async function PersonalNotificationsPage() {
  const t = await getT();
  return (
    <div>
      <SettingsSection title={t("settings.notificationsHeading")} description={t("settings.notificationsIntro")}>
        <PushSettings />
      </SettingsSection>
      <PersonalNotifications />
    </div>
  );
}
