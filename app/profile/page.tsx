import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Your own profile (app/profile/[id]). */
export default async function MyProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  redirect(`/profile/${session.user.id}`);
}
