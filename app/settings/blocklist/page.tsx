import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AutoBlockForm, BlocklistSettings } from "../blocklist-settings";
import { listBlocklist } from "@/lib/requests/blocklist";
import { blocklistEntryDto } from "@/lib/api/mappers";
import { can } from "@/lib/users/permissions";
import { getT } from "@/lib/i18n/server";
import { getDiscoverLocale } from "@/lib/tmdb/client";
import { SettingsHeader, SettingsSection } from "@/components/settings/settings-ui";

/** Settings › Blocklist: the admin's, or a member's it was handed to
 * (lib/users/permissions.ts). What's blocked, then a form for blocking
 * automatically by keyword, rating or adult content. */
export default async function BlocklistSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "manageBlocklist")) redirect("/settings");
  const [rows, t, locale] = await Promise.all([listBlocklist(), getT(), getDiscoverLocale().catch(() => null)]);

  return (
    <div>
      <SettingsHeader title={t("settings.blocklistHeading")} description={t("settings.blocklistIntro")} />
      <SettingsSection>
        <div className="overflow-hidden rounded-2xl border border-border bg-bg-1">
          <BlocklistSettings entries={rows.map(blocklistEntryDto)} />
        </div>
      </SettingsSection>
      <SettingsSection>
        <AutoBlockForm
          defaultRegion={locale?.streamingRegion ?? "US"}
          adultBlocked={rows.some((row) => row.kind === "adult")}
        />
      </SettingsSection>
    </div>
  );
}
