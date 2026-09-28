import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BlocklistSettings } from "../blocklist-settings";
import { listBlocklist } from "@/lib/requests/blocklist";
import { blocklistEntryDto } from "@/lib/api/mappers";
import { can } from "@/lib/users/permissions";
import { getT } from "@/lib/i18n/server";
import { SettingsHeader, SettingsSection } from "@/components/settings/settings-ui";

/** Settings › Blocklist: the admin's, or a member's it was handed to
 * (lib/users/permissions.ts). */
export default async function BlocklistSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "manageBlocklist")) redirect("/settings");
  const [rows, t] = await Promise.all([listBlocklist(), getT()]);

  return (
    <div>
      <SettingsHeader title={t("settings.blocklistHeading")} description={t("settings.blocklistIntro")} />
      <SettingsSection>
        <div className="overflow-hidden rounded-2xl border border-border bg-bg-1">
          <BlocklistSettings entries={rows.map(blocklistEntryDto)} />
        </div>
      </SettingsSection>
    </div>
  );
}
