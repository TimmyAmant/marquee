import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

/**
 * The app is single-admin by design (setup auto-promotes the first account,
 * no UI path creates a second) — used where request auto-approval needs an
 * admin's Sonarr/Radarr credentials but there's no admin session driving it.
 */
export async function getAdminUserId(): Promise<string | null> {
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
  return admin?.id ?? null;
}
