import { headers } from "next/headers";
import { auth } from "@/auth";
import { NavMenu } from "@/components/nav-menu";
import { getPendingRequestCount } from "@/lib/requests/query";

/**
 * The site's navigation (components/nav-menu.tsx): the floating rail on
 * desktop and the menu it opens, which is also the drawer on narrow
 * screens. Server component: reads the session directly, then hands the
 * client menu only what it shows.
 */
export async function Sidebar() {
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";
  const pendingRequestCount = isAdmin ? await getPendingRequestCount().catch(() => 0) : 0;
  // Under the name: which Marquee server this is, matching the Mac app.
  const serverLabel = (await headers()).get("host");

  return (
    <NavMenu
      isSignedIn={Boolean(session?.user)}
      isAdmin={isAdmin}
      pendingRequestCount={pendingRequestCount}
      userLabel={session?.user ? session.user.name || session.user.username || null : null}
      serverLabel={serverLabel}
    />
  );
}
