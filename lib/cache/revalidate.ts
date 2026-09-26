import { revalidatePath } from "next/cache";

/** revalidatePath for code that also runs outside a request — the Plex
 * Watchlist job files requests from a cron tick, where Next.js has no
 * request to attach the revalidation to and revalidatePath throws. There's
 * nothing cached to refresh from there anyway: the next page load reads
 * fresh data. */
export function revalidatePathSafely(path: string): void {
  try {
    revalidatePath(path);
  } catch (err) {
    if (err instanceof Error && err.message.includes("static generation store missing")) return;
    throw err;
  }
}
