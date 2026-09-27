import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { CreateUserForm } from "../create-user-form";
import { HouseholdMembersList } from "../household-members-list";
import { ImportMembers } from "../import-members";
import { listHouseholdMembers } from "../users-actions";
import { getMediaServerSignup, getSignInMethods } from "@/lib/auth/media-signin";
import { SsoSettingsCard } from "@/components/sso-settings-card";
import { getSsoSettingsView } from "@/lib/auth/sso/config";
import { webhookBaseUrl } from "@/lib/integrations/webhook-urls";
import { getT } from "@/lib/i18n/server";
import { SettingsHeader, SettingsSection } from "@/components/settings/settings-ui";

/** Settings › Members, the admin's: every account in the household,
 * adding one (by hand or from the media server), and how people sign in. */
export default async function MembersSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/settings");

  const [members, methods, mediaServerSignup, sso, headerList, t] = await Promise.all([
    listHouseholdMembers(),
    getSignInMethods(),
    getMediaServerSignup(),
    getSsoSettingsView(),
    headers(),
    getT(),
  ]);
  const available = { plex: methods.plex, jellyfin: methods.jellyfin };

  return (
    <div>
      <SettingsHeader title={t("settings.householdMembersHeading")} description={t("settings.householdMembersIntro")} />

      <SettingsSection>
        <div className="overflow-hidden rounded-2xl border border-border bg-bg-1">
          <HouseholdMembersList
            members={members}
            currentUserId={session.user.id}
            isAdmin
            jellyfinName={methods.jellyfinName}
          />
        </div>
      </SettingsSection>

      <SettingsSection title={t("settings.addMemberHeading")} description={t("settings.addMemberIntro")}>
        <div className="rounded-2xl border border-border bg-bg-1 p-6">
          <CreateUserForm />
        </div>
      </SettingsSection>

      {(available.plex || available.jellyfin) && (
        <SettingsSection title={t("settings.importHeading")} description={t("settings.importIntro")}>
          <div className="rounded-2xl border border-border bg-bg-1 p-6">
            <ImportMembers available={available} mediaServerSignup={mediaServerSignup} jellyfinName={methods.jellyfinName} />
          </div>
        </SettingsSection>
      )}

      <SettingsSection title={t("integrations.sectionSignIn")}>
        <SsoSettingsCard initial={sso} defaultPublicUrl={webhookBaseUrl(headerList)} />
      </SettingsSection>
    </div>
  );
}
