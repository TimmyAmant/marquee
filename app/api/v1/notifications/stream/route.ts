import { withApi } from "@/lib/api/handler";
import { API_VERSION, API_VERSION_HEADER } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/api/auth";
import { notificationItem } from "@/lib/api/mappers";
import { parseBearerToken } from "@/lib/api/tokens";
import { authenticateApiToken } from "@/lib/api/token-store";
import { subscribeToNotifications } from "@/lib/notifications/bus";
import { getNotificationSender } from "@/lib/sharing";

/** Between keep-alive comments, and between re-checks that the token is
 * still good: under the idle timeouts of common reverse proxies (60s for
 * nginx), so a quiet stream isn't cut off. */
const HEARTBEAT_MS = 25_000;

/**
 * The apps' live notifications: a Server-Sent Events stream that stays open
 * and gets one `notification` event (a NotificationItem, as /notifications
 * lists it) the moment the server creates one for this account. The app
 * shows it as a system notification itself, so nothing goes through any
 * outside push service. `ready` opens the stream; `signed-out` closes it
 * when the token is revoked (a password change, Sign out elsewhere).
 * Reconnect after a drop and catch up with GET /notifications.
 */
export const GET = withApi(async (request) => {
  const ctx = await requireApiUser(request);
  const token = parseBearerToken(request.headers.get("authorization"))!;
  const encoder = new TextEncoder();
  let stop = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          stop();
        }
      };

      const unsubscribe = subscribeToNotifications(ctx.user.id, async (row) => {
        // A shared title names its sender, which the row only has the id of.
        const sender = row.senderUserId ? await getNotificationSender(row.senderUserId).catch(() => null) : null;
        send(`event: notification\nid: ${row.id}\ndata: ${JSON.stringify(notificationItem({ ...row, sender }))}\n\n`);
      });
      const heartbeat = setInterval(async () => {
        const still = await authenticateApiToken(token).catch(() => undefined);
        if (still === null) {
          send("event: signed-out\ndata: {}\n\n");
          stop();
          return;
        }
        send(": keep-alive\n\n");
      }, HEARTBEAT_MS);

      stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the client going away.
        }
      };
      request.signal.addEventListener("abort", () => stop());

      // How long an EventSource-style client waits before reconnecting.
      send("retry: 5000\n\n");
      send("event: ready\ndata: {}\n\n");
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // nginx (and the proxies built on it) would otherwise buffer the
      // stream and deliver events minutes late.
      "X-Accel-Buffering": "no",
      [API_VERSION_HEADER]: String(API_VERSION),
    },
  });
});
