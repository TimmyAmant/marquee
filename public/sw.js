// Marquee's service worker. It only does one thing: show the notifications
// your own Marquee server pushes (lib/push/deliver.ts), and open the title
// when one is clicked — or, on a new request, approve or decline it from the
// notification's buttons. It doesn't cache pages or intercept requests, so
// the site behaves exactly as it does without it.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Marquee", {
      body: data.body || "",
      tag: data.tag,
      icon: "/marquee-icon.png",
      badge: "/marquee-icon.png",
      data: { url: data.url || "/", requestId: data.requestId || null },
      // Where the browser supports buttons (Android, desktop Chrome/Edge).
      actions: data.requestId
        ? [
            { action: "approve", title: "Approve" },
            { action: "decline", title: "Decline" },
          ]
        : [],
    }),
  );
});

async function reviewFromNotification(notification, action) {
  const requestId = notification.data && notification.data.requestId;
  let body = "";
  try {
    const res = await fetch(`/api/push/requests/${encodeURIComponent(requestId)}/${action}`, {
      method: "POST",
      credentials: "same-origin",
      // Signed out, the site sends its sign-in page instead of an answer.
      redirect: "manual",
    });
    const answer = await res.json().catch(() => ({}));
    body =
      res.ok && answer.ok
        ? `${action === "approve" ? "Approved" : "Declined"}: ${notification.body}`
        : answer.error || "Open Marquee and sign in, then try again.";
  } catch {
    body = "Couldn't reach your Marquee server.";
  }
  await self.registration.showNotification("Marquee", {
    body,
    tag: notification.tag,
    icon: "/marquee-icon.png",
    badge: "/marquee-icon.png",
    data: { url: "/requests" },
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "approve" || event.action === "decline") {
    event.waitUntil(reviewFromNotification(event.notification, event.action));
    return;
  }
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ("navigate" in client) await client.navigate(target);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// The browser replaced this device's subscription on its own (keys rotated,
// the old one expired): subscribe again and tell the server, so pushes keep
// arriving without anyone visiting Settings.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const options = event.oldSubscription ? event.oldSubscription.options : null;
      if (!options || !options.applicationServerKey) return;
      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: options.applicationServerKey,
      });
      await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
    })(),
  );
});
