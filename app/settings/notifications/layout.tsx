import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { NotificationsSubNav } from "@/components/settings-nav";
import { SettingsHeader } from "@/components/settings/settings-ui";
import { getT } from "@/lib/i18n/server";

/** Settings › Notifications: the heading, then a tab for your own and,
 * for the admin, one per household channel (Seerr's per-agent tabs). */
export default async function NotificationsSettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const t = await getT();
  const isAdmin = session.user.role === "admin";

  return (
    <div>
      <SettingsHeader title={t("nav.settingsNotifications")} description={t("settings.notificationsPageIntro")} />
      <NotificationsSubNav isAdmin={isAdmin} />
      {children}
    </div>
  );
}
