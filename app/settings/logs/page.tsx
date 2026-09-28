import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getT } from "@/lib/i18n/server";
import { SettingsHeader } from "@/components/settings/settings-ui";
import { LogViewer } from "@/components/log-viewer";

/** Settings › Logs (admin): what the server has been writing to its log. */
export default async function LogsSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/settings");
  const t = await getT();

  return (
    <div>
      <SettingsHeader title={t("admin.logsTitle")} description={t("admin.logsIntro")} />
      <LogViewer />
    </div>
  );
}
