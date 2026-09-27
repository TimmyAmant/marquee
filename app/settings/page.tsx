import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { CreateUserForm } from "./create-user-form";
import { HouseholdMembersList } from "./household-members-list";
import { SignOutButton } from "./sign-out-button";
import { PushSettings } from "./push-settings";
import { PersonalNotifications } from "./personal-notifications";
import { RailLabelsSetting, RailPositionSetting } from "./rail-position-setting";
import { LanguageSetting } from "./language-setting";
import { storedLanguage } from "@/lib/users/language";
import { parseRailLabels, parseRailPosition, RAIL_COOKIE, RAIL_LABELS_COOKIE } from "@/lib/rail-position";
import { listHouseholdMembers } from "./users-actions";
import { LinkedAccounts } from "./linked-accounts";
import { ImportMembers } from "./import-members";
import { BlocklistSettings } from "./blocklist-settings";
import { listBlocklist } from "@/lib/requests/blocklist";
import { blocklistEntryDto } from "@/lib/api/mappers";
import { PlexWatchlistCard } from "./plex-watchlist";
import { getWatchlistState } from "@/lib/plex/watchlist";
import { getMediaServerSignup, getSignInMethods } from "@/lib/auth/media-signin";
import { UserAvatar } from "@/components/user-avatar";
import { avatarPath } from "@/lib/users/avatar-path";
import { parseSsoErrorCode, ssoErrorMessage } from "@/lib/auth/sso/messages";
import { can } from "@/lib/users/permissions";
import { TraktSyncsCard } from "./trakt-syncs";
import { getT } from "@/lib/i18n/server";
import { loadTraktSyncs } from "@/lib/trakt/sync";

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ sso?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const t = await getT();

  const isAdmin = session.user.role === "admin";
  // The blocklist can be handed to a member (lib/users/permissions.ts).
  const managesBlocklist = can(session.user, "manageBlocklist");
  const [members, methods, mediaServerSignup, watchlist, blocklistRows, traktSyncs] = await Promise.all([
    listHouseholdMembers(),
    getSignInMethods(),
    isAdmin ? getMediaServerSignup() : Promise.resolve(true),
    getWatchlistState(session.user.id),
    managesBlocklist ? listBlocklist() : Promise.resolve([]),
    loadTraktSyncs(session.user),
  ]);
  const blocklist = blocklistRows.map(blocklistEntryDto);
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

  return (
    <div>
      <h2 className="font-display text-xl text-text-primary">{t("settings.accountHeading")}</h2>
      <p className="mt-2 text-sm text-text-secondary">{t("settings.accountIntro")}</p>

      <div className="mt-6 max-w-md rounded-2xl border border-border bg-bg-1 p-6">
        <div className="flex flex-col gap-4 text-sm">
          {/* Your photo opens your profile (app/profile). */}
          <Link href="/profile" className="flex w-fit items-center gap-3 rounded-full pr-3 hover:bg-text-primary/5">
            <UserAvatar
              label={session.user.name || session.user.username || "?"}
              src={me ? avatarPath(me, "/api") : null}
              size={56}
            />
            <span className="text-[13px] font-medium text-accent">{t("settings.profileView")}</span>
          </Link>
          <div>
            <p className="text-text-muted">{t("settings.nameLabel")}</p>
            <p className="mt-1 text-text-primary">{session.user.name || "—"}</p>
          </div>
          <div>
            <p className="text-text-muted">{t("settings.usernameLabel")}</p>
            <p className="mt-1 text-text-primary">{session.user.username}</p>
          </div>
        </div>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
          className="mt-6"
        >
          <SignOutButton />
        </form>
      </div>

      {me && (available.plex || available.jellyfin || ssoName || me.plexLinked || me.jellyfinLinked || me.ssoLinked) && (
        <>
          <h2 className="mt-10 font-display text-xl text-text-primary">{t("settings.linkedAccountsHeading")}</h2>
          <p className="mt-2 text-sm text-text-secondary">{t("settings.linkedAccountsIntro")}</p>
          <div className="mt-6 max-w-md overflow-hidden rounded-2xl border border-border bg-bg-1">
            <LinkedAccounts
              linked={{ plex: me.plexLinked, jellyfin: me.jellyfinLinked, sso: me.ssoLinked }}
              available={available}
              jellyfinName={methods.jellyfinName}
              ssoName={ssoName}
              ssoMessage={ssoMessage}
            />
          </div>
          {watchlist.available && (
            <div className="mt-4 max-w-md overflow-hidden rounded-2xl border border-border bg-bg-1">
              <PlexWatchlistCard initial={watchlist} />
            </div>
          )}
        </>
      )}

      <h2 className="mt-10 font-display text-xl text-text-primary">{t("settings.traktListsHeading")}</h2>
      <p className="mt-2 text-sm text-text-secondary">{t("settings.traktListsIntro")}</p>
      <div className="mt-6 max-w-md overflow-hidden rounded-2xl border border-border bg-bg-1">
        <TraktSyncsCard initial={traktSyncs} currentUserId={session.user.id} />
      </div>

      <h2 className="mt-10 font-display text-xl text-text-primary">{t("settings.notificationsHeading")}</h2>
      <p className="mt-2 text-sm text-text-secondary">{t("settings.notificationsIntro")}</p>
      <PushSettings />
      <PersonalNotifications />

      <h2 className="mt-10 font-display text-xl text-text-primary">{t("settings.appearanceHeading")}</h2>
      <p className="mt-2 text-sm text-text-secondary">{t("settings.appearanceIntro")}</p>
      <div className="mt-6 max-w-md overflow-hidden rounded-2xl border border-border bg-bg-1">
        <RailPositionSetting initial={railPosition} />
        <div className="border-t border-border">
          <RailLabelsSetting initial={railLabels} />
        </div>
        <div className="border-t border-border">
          <LanguageSetting initial={storedLanguage(session.user.language)} />
        </div>
      </div>

      <h2 className="mt-10 font-display text-xl text-text-primary">
        {isAdmin ? t("settings.householdMembersHeading") : t("settings.yourAccountHeading")}
      </h2>
      <p className="mt-2 text-sm text-text-secondary">
        {isAdmin
          ? t("settings.householdMembersIntro")
          : t("settings.yourAccountIntro")}
      </p>
      <div className="mt-6 max-w-md overflow-hidden rounded-2xl border border-border bg-bg-1">
        <HouseholdMembersList members={members} currentUserId={session.user.id} isAdmin={isAdmin} jellyfinName={methods.jellyfinName} />
      </div>

      {isAdmin && (
        <>
          <h2 className="mt-10 font-display text-xl text-text-primary">{t("settings.addMemberHeading")}</h2>
          <p className="mt-2 text-sm text-text-secondary">{t("settings.addMemberIntro")}</p>
          <div className="mt-6 max-w-md rounded-2xl border border-border bg-bg-1 p-6">
            <CreateUserForm />
          </div>

          {(available.plex || available.jellyfin) && (
            <>
              <h2 className="mt-10 font-display text-xl text-text-primary">{t("settings.importHeading")}</h2>
              <p className="mt-2 text-sm text-text-secondary">{t("settings.importIntro")}</p>
              <div className="mt-6 max-w-md rounded-2xl border border-border bg-bg-1 p-6">
                <ImportMembers
                  available={available}
                  mediaServerSignup={mediaServerSignup}
                  jellyfinName={methods.jellyfinName}
                />
              </div>
            </>
          )}
        </>
      )}

      {managesBlocklist && (
        <>
          <h2 className="mt-10 font-display text-xl text-text-primary">{t("settings.blocklistHeading")}</h2>
          <p className="mt-2 text-sm text-text-secondary">{t("settings.blocklistIntro")}</p>
          <div className="mt-6 max-w-md overflow-hidden rounded-2xl border border-border bg-bg-1">
            <BlocklistSettings entries={blocklist} />
          </div>
        </>
      )}
    </div>
  );
}
