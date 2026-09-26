import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { NavMenu } from "@/components/nav-menu";
import { PushPrompt } from "@/components/push-prompt";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getPendingRequestCount } from "@/lib/requests/query";
import { getOpenIssueCount } from "@/lib/issues";
import { getNotFoundCount } from "@/lib/requests/not-found";
import { canReviewRequests } from "@/lib/users/roles";
import { avatarPath } from "@/lib/users/avatar-path";

/**
 * The site's navigation (components/nav-menu.tsx): the floating rail on
 * desktop and the menu it opens, which is also the drawer on narrow
 * screens. Server component: reads the session directly, then hands the
 * client menu only what it shows.
 */
export async function Sidebar() {
  const session = await auth();
  // The Requests badge is for whoever works the review queue: the admin or a
  // trusted member.
  const isAdmin = canReviewRequests(session?.user?.role);
  // Requests and problem reports both wait on the Requests page — the same
  // sum the badge's poll (getPendingRequestCountAction) returns.
  const pendingRequestCount = isAdmin
    ? (await getPendingRequestCount().catch(() => 0)) +
      (await getOpenIssueCount().catch(() => 0)) +
      (await getNotFoundCount().catch(() => 0))
    : 0;
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
        isAdmin={isAdmin}
        pendingRequestCount={pendingRequestCount}
        userLabel={session?.user ? session.user.name || session.user.username || null : null}
        avatarSrc={photo ? avatarPath(photo, "/api") : null}
        serverLabel={serverLabel}
      />
      {/* Asks about notifications on this device after signing in. */}
      {session?.user && <PushPrompt />}
    </>
  );
}
