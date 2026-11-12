// The browser half of Web Push, shared by the sign-in prompt
// (components/push-prompt.tsx) and Settings (app/settings/push-settings.tsx).
// Browser-only: every function here touches navigator/window.

import type { Translator } from "@/lib/i18n/translator";

/** "Not now" on the prompt, remembered per browser until the next sign-in
 * (the login form clears it, which is what makes the question come back
 * each time someone signs in rather than on every page). */
export const PUSH_PROMPT_DISMISSED_KEY = "marquee-push-prompt-dismissed";

export type PushSupport =
  /** Ready to ask. */
  | "supported"
  /** Opened over plain http on the network: browsers only allow push (and
   * service workers) on https or localhost. */
  | "insecure"
  /** iPhone/iPad Safari in a tab: push exists only for a site opened from
   * the Home Screen. */
  | "ios-home-screen"
  /** This browser has no Web Push at all. */
  | "unsupported";

function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (!window.isSecureContext) return "insecure";
  const hasPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!hasPush) return isIos() && !isStandalone() ? "ios-home-screen" : "unsupported";
  return "supported";
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

/** This browser's current subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "supported") return null;
  const existing = await navigator.serviceWorker.getRegistration("/");
  return existing ? existing.pushManager.getSubscription() : null;
}

export type EnableResult = { ok: true } | { ok: false; reason: "denied" | "failed"; message: string };

/** Asks for permission (this must run from a click: Safari refuses
 * otherwise), subscribes with this server's key and registers the
 * subscription with the server. */
export async function enablePush(t: Translator): Promise<EnableResult> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return {
        ok: false,
        reason: "denied",
        message: t("notify.pushBlocked"),
      };
    }

    const keyRes = await fetch("/api/push/subscriptions");
    if (!keyRes.ok) throw new Error("key");
    const { publicKey } = (await keyRes.json()) as { publicKey: string };

    const reg = await registration();
    let subscription = await reg.pushManager.getSubscription();
    // A subscription made with another key (a restored server, a different
    // Marquee on the same address) can't be pushed to by this one.
    const current = subscription?.options.applicationServerKey;
    if (subscription && current && btoaUrl(current) !== publicKey) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    });

    const saveRes = await fetch("/api/push/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!saveRes.ok) {
      const data = (await saveRes.json().catch(() => ({}))) as { error?: string };
      return { ok: false, reason: "failed", message: data.error ?? t("notify.pushEnableFailed") };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed", message: t("notify.pushEnableFailed") };
  }
}

function btoaUrl(buffer: ArrayBuffer): string {
  let raw = "";
  for (const byte of new Uint8Array(buffer)) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Which account this tab last handed the subscription to (sessionStorage),
// so it's sent once per tab and account rather than on every page load.
const CLAIMED_KEY = "marquee-push-claimed-by";

/** Hands this browser's existing subscription to whoever is signed in now.
 * A subscription belongs to the browser, not the account: when a session
 * ends any way but Settings' Sign out (it expires, the cookie is cleared, a
 * password change signs everyone out), the server still has it under the
 * last account, and the next person to sign in here would get that
 * account's notifications (an admin's Approve/Decline included). Saving it
 * again moves it over (lib/push/deliver.ts). Quietly does nothing without
 * a subscription or permission. */
export async function claimSubscription(userId: string): Promise<void> {
  if (pushSupport() !== "supported" || Notification.permission !== "granted") return;
  try {
    if (sessionStorage.getItem(CLAIMED_KEY) === userId) return;
  } catch {
    // Storage blocked: just send it.
  }
  const subscription = await currentSubscription();
  if (!subscription) return;
  const res = await fetch("/api/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!res.ok) return;
  try {
    sessionStorage.setItem(CLAIMED_KEY, userId);
  } catch {
    // As above.
  }
}

/** Stops notifications on this browser: forgets it on the server first
 * (while the session still exists, which matters when signing out), then
 * unsubscribes locally. */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription().catch(() => null);
  if (!subscription) return;
  await fetch("/api/push/subscriptions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
}
