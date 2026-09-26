import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { canReviewRequests } from "@/lib/users/roles";
import { approveRequest, rejectRequest } from "@/lib/requests/mutate";

// The "Approve" / "Decline" buttons on a new-request push notification
// (public/sw.js). The service worker calls this with the browser's session
// cookie, so it's the website's own check: signed in, and someone who
// reviews requests.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  // Only Marquee's own service worker (same origin) — stricter than the
  // other session-cookie routes, since this approves and declines.
  if (request.headers.get("sec-fetch-site") !== "same-origin") {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Sign in to Marquee first." }, { status: 401 });
  if (!canReviewRequests(session.user.role)) {
    return NextResponse.json({ error: "Only the admin can review requests." }, { status: 403 });
  }
  const { id, action } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Request not found or already reviewed." }, { status: 404 });

  const result =
    action === "approve"
      ? await approveRequest(id, session.user.id)
      : action === "decline"
        ? await rejectRequest(id, session.user.id, null)
        : null;
  if (!result) return NextResponse.json({ error: "Unknown action." }, { status: 404 });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  revalidatePath("/requests");
  return NextResponse.json({ ok: true });
}
