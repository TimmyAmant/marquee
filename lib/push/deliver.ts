import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pushKeys, pushSubscriptions } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto/encryption";
import { fail, type CoreResult } from "@/lib/core-result";
import { generateVapidKeys, isAllowedPushEndpoint, sendWebPush, type VapidKeys } from "@/lib/push/web-push";
import type { NotificationRow } from "@/lib/notifications/bus";

// Web Push for the website: this server's keys, the browsers subscribed to
// each account, and sending a notification to all of them. The encryption
// and signing live in lib/push/web-push.ts.

let cachedKeys: VapidKeys | null = null;

/** This server's VAPID keys, created the first time anything needs them. */
export async function getVapidKeys(): Promise<VapidKeys> {
  if (cachedKeys) return cachedKeys;

  const [existing] = await db.select().from(pushKeys).limit(1);
  if (!existing) {
    const fresh = generateVapidKeys();
    const encrypted = encryptSecret(fresh.privateKey);
    // Two requests racing here both try; the singleton check lets one win
    // and the re-read below picks up whichever it was.
    await db
      .insert(pushKeys)
      .values({
        id: 1,
        publicKey: fresh.publicKey,
        privateKeyEnc: encrypted.ciphertext,
        privateKeyIv: encrypted.iv,
        privateKeyTag: encrypted.tag,
      })
      .onConflictDoNothing();
  }

  const [row] = await db.select().from(pushKeys).limit(1);
  cachedKeys = {
    publicKey: row.publicKey,
    privateKey: decryptSecret({ ciphertext: row.privateKeyEnc, iv: row.privateKeyIv, tag: row.privateKeyTag }),
  };
  return cachedKeys;
}

export type SubscriptionInput = { endpoint: unknown; keys?: { p256dh?: unknown; auth?: unknown } | null };

/** Saves (or moves to this account) one browser's subscription. */
export async function saveSubscription(
  userId: string,
  input: SubscriptionInput,
  meta: { label: string | null; origin: string | null },
): Promise<CoreResult> {
  const endpoint = typeof input.endpoint === "string" ? input.endpoint : "";
  const p256dh = typeof input.keys?.p256dh === "string" ? input.keys.p256dh : "";
  const auth = typeof input.keys?.auth === "string" ? input.keys.auth : "";
  if (!endpoint || !p256dh || !auth || endpoint.length > 1000 || p256dh.length > 200 || auth.length > 100) {
    return fail("invalid", "That browser's notification details are incomplete.");
  }
  if (!isAllowedPushEndpoint(endpoint)) {
    return fail("invalid", "This browser uses a push service Marquee doesn't know.");
  }

  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint, p256dh, auth, label: meta.label, origin: meta.origin })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh, auth, label: meta.label, origin: meta.origin, createdAt: new Date() },
    });
  return { ok: true };
}

export async function removeSubscription(userId: string, endpoint: unknown): Promise<void> {
  if (typeof endpoint !== "string" || !endpoint) return;
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

/** Every browser of an account is signed out when its password changes, so
 * none of them should keep getting that account's notifications either. */
export async function removeAllSubscriptions(userId: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
}

export async function listSubscriptions(userId: string) {
  return db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      label: pushSubscriptions.label,
      createdAt: pushSubscriptions.createdAt,
      lastSuccessAt: pushSubscriptions.lastSuccessAt,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
}

const EVENT_TITLES: Record<NotificationRow["eventType"], string> = {
  grabbed: "Downloading",
  downloaded: "Ready to watch",
  request_approved: "Request approved",
  request_rejected: "Request declined",
  issue_reported: "Problem reported",
  issue_resolved: "Problem fixed",
  request_created: "New request",
};

/** What the service worker (public/sw.js) shows. `requestId`: a new
 * request, which the notification offers to approve or decline on the spot
 * (where the browser supports notification buttons). */
export type PushMessage = { title: string; body: string; url: string; tag: string; requestId?: string };

export function pushMessageFor(
  row: Pick<NotificationRow, "id" | "eventType" | "message" | "mediaType" | "tmdbId" | "requestId">,
): PushMessage {
  const isNewRequest = row.eventType === "request_created" && row.requestId;
  return {
    title: EVENT_TITLES[row.eventType] ?? "Marquee",
    body: row.message,
    url: isNewRequest ? "/requests" : `/title/${row.mediaType}/${row.tmdbId}`,
    tag: row.id,
    ...(isNewRequest ? { requestId: row.requestId! } : {}),
  };
}

/** The VAPID contact: the site's own https address when the browser
 * subscribed over https (what Apple's service wants), else a placeholder
 * mailto, which only happens for a localhost dev setup. */
function subjectFor(origin: string | null): string {
  return origin?.startsWith("https://") ? origin : "mailto:push@marquee.invalid";
}

/** Sends one message to every browser subscribed to an account. Never
 * throws: a notification is already saved before this runs, and push is a
 * courtesy on top. Returns how many browsers took it. */
export async function pushToUser(userId: string, message: PushMessage): Promise<number> {
  try {
    const subscriptions = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    if (subscriptions.length === 0) return 0;
    const keys = await getVapidKeys();

    const results = await Promise.all(
      subscriptions.map(async (subscription) => {
        const result = await sendWebPush(subscription, message, keys, subjectFor(subscription.origin), {
          // A topic (≤32 base64url characters) lets a newer push about the
          // same notification replace one that hasn't been delivered yet.
          topic: message.tag.replace(/-/g, "").slice(0, 32),
        });
        if (result.status === "gone") {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
        } else if (result.status === "sent") {
          await db
            .update(pushSubscriptions)
            .set({ lastSuccessAt: new Date() })
            .where(eq(pushSubscriptions.id, subscription.id));
        } else {
          console.warn(`[push] couldn't reach ${new URL(subscription.endpoint).host}: ${result.detail}`);
        }
        return result.status === "sent";
      }),
    );
    return results.filter(Boolean).length;
  } catch (err) {
    console.error("[push] delivery failed:", err);
    return 0;
  }
}
