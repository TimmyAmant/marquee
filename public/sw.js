// Marquee's service worker. It only does one thing: show the notifications
// your own Marquee server pushes (lib/push/deliver.ts), and open the title
// when one is clicked — or, on a new request, approve or decline it from the
// notification's buttons. It doesn't cache pages or intercept requests, so
// the site behaves exactly as it does without it.
//
// The words on a new request's buttons, and what it says once one is
// pressed, come with the push in the recipient's language (`labels`,
// lib/push/deliver.ts); the English below is only for a push from an older
// server without them.

const ENGLISH = {
  approve: "Approve",
  decline: "Decline",
  approved: null,
  declined: null,
  signIn: "Open Marquee and sign in, then try again.",
  unreachable: "Couldn't reach your Marquee server.",
};

function labelsOf(data) {
  const given = data && typeof data.labels === "object" && data.labels ? data.labels : {};
  const labels = {};
  for (const key of Object.keys(ENGLISH)) {
    labels[key] = typeof given[key] === "string" && given[key] ? given[key] : ENGLISH[key];
  }
  return labels;
}

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
  const labels = labelsOf(data);
  event.waitUntil(
    self.registration.showNotification(data.title || "Marquee", {
      body: data.body || "",
      tag: data.tag,
      icon: "/marquee-icon.png",
      badge: "/marquee-icon.png",
      data: { url: data.url || "/", requestId: data.requestId || null, labels },
      // Where the browser supports buttons (Android, desktop Chrome/Edge).
      actions: data.requestId
        ? [
            { action: "approve", title: labels.approve },
            { action: "decline", title: labels.decline },
          ]
        : [],
    }),
  );
});

async function reviewFromNotification(notification, action) {
  const requestId = notification.data && notification.data.requestId;
  const labels = labelsOf(notification.data);
  let body = "";
  try {
    const res = await fetch(`/api/push/requests/${encodeURIComponent(requestId)}/${action}`, {
      method: "POST",
      credentials: "same-origin",
      // Signed out, the site sends its sign-in page instead of an answer.
      redirect: "manual",
    });
    const answer = await res.json().catch(() => ({}));
    if (res.ok && answer.ok) {
      const done = action === "approve" ? labels.approved : labels.declined;
      body = done || `${action === "approve" ? "Approved" : "Declined"}: ${notification.body}`;
    } else {
      body = answer.error || labels.signIn;
    }
  } catch {
    body = labels.unreachable;
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
