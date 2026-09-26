import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { CreateUserForm } from "./create-user-form";
import { HouseholdMembersList } from "./household-members-list";
import { SignOutButton } from "./sign-out-button";
import { PushSettings } from "./push-settings";
import { listHouseholdMembers } from "./users-actions";
import { LinkedAccounts } from "./linked-accounts";
import { ImportMembers } from "./import-members";
import { PlexWatchlistCard } from "./plex-watchlist";
import { getWatchlistState } from "@/lib/plex/watchlist";
import { getMediaServerSignup, getSignInMethods } from "@/lib/auth/media-signin";
import { UserAvatar } from "@/components/user-avatar";
import { avatarPath } from "@/lib/users/avatar-path";

export default async function AccountSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = session.user.role === "admin";
  const [members, methods, mediaServerSignup, watchlist] = await Promise.all([
    listHouseholdMembers(),
    getSignInMethods(),
    isAdmin ? getMediaServerSignup() : Promise.resolve(true),
    getWatchlistState(session.user.id),
  ]);
  const available = { plex: methods.plex, jellyfin: methods.jellyfin };
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

      {me && (available.plex || available.jellyfin || me.plexLinked || me.jellyfinLinked) && (
        <>
          <h2 className="mt-10 font-display text-xl text-text-primary">Linked accounts</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Sign in with the account you use for the household&apos;s media server.
          </p>
          <div className="mt-6 max-w-md overflow-hidden rounded-2xl border border-border bg-bg-1">
            <LinkedAccounts
              linked={{ plex: me.plexLinked, jellyfin: me.jellyfinLinked }}
              available={available}
              jellyfinName={methods.jellyfinName}
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
        </>
      )}
    </div>
  );
}
