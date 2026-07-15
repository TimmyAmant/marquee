import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

/** True once at least one account exists — used to gate the one-time first-run
 * setup page vs. normal login, since this app has no public self-serve signup. */
export async function hasAnyUser(): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).limit(1);
  return Boolean(row);
}
