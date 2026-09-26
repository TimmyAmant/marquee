import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { CreateUserForm } from "./create-user-form";
import { HouseholdMembersList } from "./household-members-list";
import { SignOutButton } from "./sign-out-button";
import { PushSettings } from "./push-settings";
import { PersonalNotifications } from "./personal-notifications";
import { RailPositionSetting } from "./rail-position-setting";
import { parseRailPosition, RAIL_COOKIE } from "@/lib/rail-position";
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

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ sso?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = session.user.role === "admin";
  const [members, methods, mediaServerSignup, watchlist, blocklistRows] = await Promise.all([
    listHouseholdMembers(),
    getSignInMethods(),
    isAdmin ? getMediaServerSignup() : Promise.resolve(true),
    getWatchlistState(session.user.id),
    isAdmin ? listBlocklist() : Promise.resolve([]),
  ]);
  const blocklist = blocklistRows.map(blocklistEntryDto);
  const railPosition = parseRailPosition((await cookies()).get(RAIL_COOKIE)?.value);
  const available = { plex: methods.plex, jellyfin: methods.jellyfin };
  // Back from linking single sign-on: "linked", or a fixed error code.
  const ssoParam = (await searchParams).sso;
  const ssoName = methods.sso?.name ?? null;
  const ssoError = parseSsoErrorCode(ssoParam);
  const ssoMessage =
    ssoParam === "linked"
      ? { ok: true, text: `${ssoName ?? "Single sign-on"} is linked. You can sign in with it now.` }
      : ssoError
        ? { ok: false, text: ssoErrorMessage(ssoError, ssoName ?? "single sign-on") }
        : null;
  // Your own row is always in the list (members see only theirs).
  const me = members.find((member) => member.id === session.user.id);

  return (
    <div>
      <h2 className="font-display text-xl text-text-primary">Account</h2>
      <p className="mt-2 text-sm text-text-secondary">
        Your Marquee account details.
      </p>

      <div className="mt-6 max-w-md rounded-2xl border border-border bg-bg-1 p-6">
        <div className="flex flex-col gap-4 text-sm">
          <UserAvatar
            label={session.user.name || session.user.username || "?"}
            src={me ? avatarPath(me, "/api") : null}
            size={56}
          />
          <div>
            <p className="text-text-muted">Name</p>
            <p className="mt-1 text-text-primary">{session.user.name || "—"}</p>
          </div>
          <div>
            <p className="text-text-muted">Username</p>
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
          <h2 className="mt-10 font-display text-xl text-text-primary">Linked accounts</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Sign in with the account you use for the household&apos;s media server or single sign-on.
          </p>
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

      <h2 className="mt-10 font-display text-xl text-text-primary">Notifications</h2>
      <p className="mt-2 text-sm text-text-secondary">
        Requests approved or declined, and titles ready to watch, on this device.
      </p>
      <PushSettings />
      <PersonalNotifications />

      <h2 className="mt-10 font-display text-xl text-text-primary">Appearance</h2>
      <p className="mt-2 text-sm text-text-secondary">How Marquee looks on this device.</p>
      <div className="mt-6 max-w-md overflow-hidden rounded-2xl border border-border bg-bg-1">
        <RailPositionSetting initial={railPosition} />
      </div>

      <h2 className="mt-10 font-display text-xl text-text-primary">
        {isAdmin ? "Household members" : "Your account"}
      </h2>
      <p className="mt-2 text-sm text-text-secondary">
        {isAdmin
          ? "Everyone with an account on this Marquee instance."
          : "Edit your name, username, or password below."}
      </p>
      <div className="mt-6 max-w-md overflow-hidden rounded-2xl border border-border bg-bg-1">
        <HouseholdMembersList members={members} currentUserId={session.user.id} isAdmin={isAdmin} jellyfinName={methods.jellyfinName} />
      </div>

      {isAdmin && (
        <>
          <h2 className="mt-10 font-display text-xl text-text-primary">Add a household member</h2>
          <p className="mt-2 text-sm text-text-secondary">
            There&apos;s no public signup page — create accounts for other people in your
            household here.
          </p>
          <div className="mt-6 max-w-md rounded-2xl border border-border bg-bg-1 p-6">
            <CreateUserForm />
          </div>

          {(available.plex || available.jellyfin) && (
            <>
              <h2 className="mt-10 font-display text-xl text-text-primary">Import from your media server</h2>
              <p className="mt-2 text-sm text-text-secondary">
                Add the people you already share your server with. They sign in with that account — no
                password to hand out.
              </p>
              <div className="mt-6 max-w-md rounded-2xl border border-border bg-bg-1 p-6">
                <ImportMembers
                  available={available}
                  mediaServerSignup={mediaServerSignup}
                  jellyfinName={methods.jellyfinName}
                />
              </div>
            </>
          )}

          <h2 className="mt-10 font-display text-xl text-text-primary">Request blocklist</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Titles and keywords nobody can request. Block a single title from its page.
          </p>
          <div className="mt-6 max-w-md overflow-hidden rounded-2xl border border-border bg-bg-1">
            <BlocklistSettings entries={blocklist} />
          </div>
        </>
      )}
    </div>
  );
}
