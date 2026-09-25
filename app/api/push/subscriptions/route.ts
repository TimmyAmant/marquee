import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getVapidKeys, listSubscriptions, removeSubscription, saveSubscription } from "@/lib/push/deliver";
import { deviceLabel } from "@/lib/push/device-label";

// The website's Web Push subscriptions, on the browser session: the push
// prompt (components/push-prompt.tsx) and Settings' notification card
// (app/settings/push-settings.tsx) are the only callers.

async function userId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** Same guard as the photo routes: these ride on the session cookie. */
function crossSite(request: Request): boolean {
  return request.headers.get("sec-fetch-site") === "cross-site";
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

/** This server's public key (what a browser subscribes with) and the
 * account's subscribed browsers. */
export async function GET() {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const [keys, devices] = await Promise.all([getVapidKeys(), listSubscriptions(id)]);
  return NextResponse.json({
    publicKey: keys.publicKey,
    devices: devices.map((d) => ({
      id: d.id,
      endpoint: d.endpoint,
      label: d.label,
      createdAt: d.createdAt.toISOString(),
      lastSuccessAt: d.lastSuccessAt?.toISOString() ?? null,
    })),
  });
}

/** Body: the browser's PushSubscription as JSON ({ endpoint, keys }). */
export async function POST(request: Request) {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (crossSite(request)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const body = await readJson(request);
  const result = await saveSubscription(
    id,
    { endpoint: body.endpoint, keys: body.keys as { p256dh?: unknown; auth?: unknown } | null },
    { label: deviceLabel(request.headers.get("user-agent")), origin: request.headers.get("origin") },
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/** Body: { endpoint }. Turning notifications off here, or signing out. */
export async function DELETE(request: Request) {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (crossSite(request)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const body = await readJson(request);
  await removeSubscription(id, body.endpoint);
  return NextResponse.json({ ok: true });
}
