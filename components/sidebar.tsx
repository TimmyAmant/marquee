import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { NavMenu } from "@/components/nav-menu";
import { PushPrompt } from "@/components/push-prompt";
import { WhatsNew } from "@/components/whats-new";
import { APP_VERSION } from "@/lib/api/version";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { can } from "@/lib/users/permissions";
import { attentionCount } from "@/lib/requests/access";
import { avatarPath } from "@/lib/users/avatar-path";

/**
 * The site's navigation (components/nav-menu.tsx): the floating rail on
 * desktop, and the tab bar along the bottom on phone-sized windows. Server
 * component: reads the session directly, then hands the client menu only
 * what it shows.
 */
export async function Sidebar() {
  const session = await auth();
  // The Requests badge is for whoever works the review queue or handles
  // problem reports (lib/users/permissions.ts). What waits on the Requests
  // page for them — the same sum the badge's poll
  // (getPendingRequestCountAction) returns.
  const showRequestsBadge = can(session?.user, "reviewRequests") || can(session?.user, "manageIssues");
  const pendingRequestCount =
    showRequestsBadge && session?.user ? await attentionCount(session.user).catch(() => 0) : 0;
  // Under the name: which Marquee server this is, matching the Mac app.
  const serverLabel = (await headers()).get("host");
  // Read fresh rather than from the session token, so a new photo shows on
  // the very next page.
  const [photo] = session?.user?.id
    ? await db
        .select({ id: users.id, avatarUpdatedAt: users.avatarUpdatedAt })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1)
        .catch(() => [])
    : [];

  return (
    <>
      <NavMenu
        isSignedIn={Boolean(session?.user)}
        userId={session?.user?.id ?? null}
        showRequestsBadge={showRequestsBadge}
        pendingRequestCount={pendingRequestCount}
        userLabel={session?.user ? session.user.name || session.user.username || null : null}
        avatarSrc={photo ? avatarPath(photo, "/api") : null}
        serverLabel={serverLabel}
        serverVersion={APP_VERSION}
      />
      {/* Asks about notifications on this device after signing in. */}
      {session?.user?.id && <PushPrompt key={session.user.id} userId={session.user.id} />}
      {/* "What's new" once after the server is upgraded (once per device). */}
      {session?.user?.id && <WhatsNew userId={session.user.id} serverVersion={APP_VERSION} />}
    </>
  );
}
