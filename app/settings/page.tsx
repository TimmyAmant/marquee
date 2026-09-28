import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { HouseholdMembersList } from "./household-members-list";
import { SignOutButton } from "./sign-out-button";
import { RailLabelsSetting, RailPositionSetting } from "./rail-position-setting";
import { LanguageSetting } from "./language-setting";
import { storedLanguage } from "@/lib/users/language";
import { parseRailLabels, parseRailPosition, RAIL_COOKIE, RAIL_LABELS_COOKIE } from "@/lib/rail-position";
import { listHouseholdMembers } from "./users-actions";
import { LinkedAccounts } from "./linked-accounts";
import { PlexWatchlistCard } from "./plex-watchlist";
import { getWatchlistState } from "@/lib/plex/watchlist";
import { getSignInMethods } from "@/lib/auth/media-signin";
import { UserAvatar } from "@/components/user-avatar";
import { avatarPath } from "@/lib/users/avatar-path";
import { parseSsoErrorCode, ssoErrorMessage } from "@/lib/auth/sso/messages";
import { TraktSyncsCard } from "./trakt-syncs";
import { getT } from "@/lib/i18n/server";
import { loadTraktSyncs } from "@/lib/trakt/sync";
import { SettingRow, SettingsGroup, SettingsHeader, SettingsSection, SettingValue } from "@/components/settings/settings-ui";

/** Settings › Account, everyone's: who you are, how you sign in, your
 * Trakt lists and how Marquee looks here. The household's accounts are
 * under Members (the admin's); notifications have their own tab. */
export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ sso?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const t = await getT();

  const isAdmin = session.user.role === "admin";
  const [members, methods, watchlist, traktSyncs] = await Promise.all([
    listHouseholdMembers(),
    getSignInMethods(),
    getWatchlistState(session.user.id),
    loadTraktSyncs(session.user),
  ]);
  const cookieStore = await cookies();
  const railPosition = parseRailPosition(cookieStore.get(RAIL_COOKIE)?.value);
  const railLabels = parseRailLabels(cookieStore.get(RAIL_LABELS_COOKIE)?.value);
  const available = { plex: methods.plex, jellyfin: methods.jellyfin };
  // Back from linking single sign-on: "linked", or a fixed error code.
  const ssoParam = (await searchParams).sso;
  const ssoName = methods.sso?.name ?? null;
  const ssoError = parseSsoErrorCode(ssoParam);
  const ssoMessage =
    ssoParam === "linked"
      ? { ok: true, text: t("settings.ssoLinked", { name: ssoName ?? t("settings.singleSignOn") }) }
      : ssoError
        ? { ok: false, text: ssoErrorMessage(ssoError, ssoName, t) }
        : null;
  // Your own row is always in the list (members see only theirs).
  const me = members.find((member) => member.id === session.user.id);
  const showsLinked =
    me && (available.plex || available.jellyfin || ssoName || me.plexLinked || me.jellyfinLinked || me.ssoLinked);

  return (
    <div>
      <SettingsHeader title={t("settings.accountHeading")} description={t("settings.accountPageIntro")} />

      <SettingsSection title={t("settings.profileHeading")}>
        <SettingsGroup>
          <SettingRow label={t("settings.photoLabel")} help={t("settings.photoRowHelp")}>
            {/* Your photo opens your profile (app/profile). */}
            <Link href="/profile" className="flex w-fit items-center gap-3 rounded-full pr-3 hover:bg-text-primary/5">
              <UserAvatar
                label={session.user.name || session.user.username || "?"}
                src={me ? avatarPath(me, "/api") : null}
                size={44}
              />
              <span className="text-[13px] font-medium text-accent">{t("settings.profileView")}</span>
            </Link>
          </SettingRow>
          <SettingRow label={t("settings.nameLabel")}>
            <SettingValue>{session.user.name || "—"}</SettingValue>
          </SettingRow>
          <SettingRow label={t("settings.usernameLabel")}>
            <SettingValue>{session.user.username}</SettingValue>
          </SettingRow>
          <SettingRow label={t("settings.signOut")} help={t("settings.signOutHelp")}>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <SignOutButton />
            </form>
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      {/* Name, username, password and photo: your own row of the household list. */}
      {me && (
        <SettingsSection title={t("settings.yourAccountHeading")} description={t("settings.yourAccountIntro")}>
          <div className="overflow-hidden rounded-2xl border border-border bg-bg-1">
            <HouseholdMembersList
              members={[me]}
              currentUserId={session.user.id}
              isAdmin={isAdmin}
              jellyfinName={methods.jellyfinName}
            />
          </div>
        </SettingsSection>
      )}

      {me && showsLinked && (
        <SettingsSection title={t("settings.linkedAccountsHeading")} description={t("settings.linkedAccountsIntro")}>
          <div className="overflow-hidden rounded-2xl border border-border bg-bg-1">
            <LinkedAccounts
              linked={{ plex: me.plexLinked, jellyfin: me.jellyfinLinked, sso: me.ssoLinked }}
              available={available}
              jellyfinName={methods.jellyfinName}
              ssoName={ssoName}
              ssoMessage={ssoMessage}
            />
          </div>
          {watchlist.available && (
            <div className="overflow-hidden rounded-2xl border border-border bg-bg-1">
              <PlexWatchlistCard initial={watchlist} />
            </div>
          )}
        </SettingsSection>
      )}

      <SettingsSection title={t("settings.traktListsHeading")} description={t("settings.traktListsIntro")}>
        <div className="overflow-hidden rounded-2xl border border-border bg-bg-1">
          <TraktSyncsCard initial={traktSyncs} currentUserId={session.user.id} />
        </div>
      </SettingsSection>

      <SettingsSection title={t("settings.appearanceHeading")} description={t("settings.appearanceIntro")}>
        <SettingsGroup>
          <RailPositionSetting initial={railPosition} />
          <RailLabelsSetting initial={railLabels} />
          <LanguageSetting initial={storedLanguage(session.user.language)} />
        </SettingsGroup>
      </SettingsSection>
    </div>
  );
}
