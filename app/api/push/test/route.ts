import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/auth";
import { pushToUser } from "@/lib/push/deliver";

/** Settings' "Send a test": one notification to every browser of this
 * account that turned them on, so you can see it arrive. Nothing is saved
 * to the notification list. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const delivered = await pushToUser(session.user.id, {
    title: "Marquee",
    body: "Notifications are working on this device.",
    url: "/settings",
    tag: randomUUID(),
  });
  return NextResponse.json({ ok: true, delivered });
}
