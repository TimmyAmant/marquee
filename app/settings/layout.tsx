import { auth } from "@/auth";
import { SettingsNav } from "@/components/settings-nav";
import { can } from "@/lib/users/permissions";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const viewer = {
    isAdmin: session?.user?.role === "admin",
    // The blocklist can be handed to a member (lib/users/permissions.ts).
    canManageBlocklist: session?.user ? can(session.user, "manageBlocklist") : false,
  };

  return <SettingsNav viewer={viewer}>{children}</SettingsNav>;
}
