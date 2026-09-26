"use server";

import { auth } from "@/auth";
import { CHANGELOG } from "@/lib/changelog";
import { APP_VERSION } from "@/lib/api/version";
import { selectWhatsNew, type WhatsNewSelection } from "@/lib/whats-new";

/** The website's "What's new" pop-up: this server's releases after `since`.
 * The same text as GET /api/v1/changelog, which the Mac and Windows apps read. */
export async function whatsNewAction(since: string): Promise<(WhatsNewSelection & { version: string }) | null> {
  const session = await auth();
  if (!session?.user || typeof since !== "string") return null;
  return { version: APP_VERSION, ...selectWhatsNew(CHANGELOG, since, APP_VERSION) };
}
