import { auth } from "@/auth";
import { SettingsNav } from "@/components/settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";

  return <SettingsNav isAdmin={isAdmin}>{children}</SettingsNav>;
}
