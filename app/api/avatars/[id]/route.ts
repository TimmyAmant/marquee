import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { avatarResponse, readAvatarUpload, removeUserAvatar, setUserAvatar } from "@/lib/users/avatar";
import { avatarPath } from "@/lib/users/avatar-path";
import type { Actor } from "@/lib/users/household";

// The website's side of profile photos, on the browser session. Native
// clients use /api/v1/users/{id}/avatar with their token instead; both go
// through lib/users/avatar.ts.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ id: string }> };

async function actor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return { userId: session.user.id, isAdmin: session.user.role === "admin" };
}

function error(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** Changing a photo rides on the session cookie, so refuse a request another
 * site started. (A cross-site PUT or DELETE already needs a CORS preflight
 * this route never grants; this is the belt to that pair of braces.) */
function crossSite(request: Request): boolean {
  return request.headers.get("sec-fetch-site") === "cross-site";
}

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const viewer = await actor();
  if (!viewer || !UUID.test(id)) return new Response(null, { status: 404 });
  return avatarResponse(viewer, id, request);
}

/** The body is the image file itself. */
export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
  const viewer = await actor();
  if (!viewer) return error(401, "Sign in required.");
  if (crossSite(request)) return error(403, "Forbidden.");
  if (!UUID.test(id)) return error(404, "Account not found.");

  const upload = await readAvatarUpload(request);
  if (!upload.ok) return error(400, upload.error);
  const result = await setUserAvatar(viewer, id, upload.bytes);
  if (!result.ok) return error(result.code === "forbidden" ? 403 : result.code === "not_found" ? 404 : 400, result.error);
  return NextResponse.json({ ok: true, avatarUrl: avatarPath(result.owner, "/api") });
}

export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  const viewer = await actor();
  if (!viewer) return error(401, "Sign in required.");
  if (crossSite(request)) return error(403, "Forbidden.");
  if (!UUID.test(id)) return error(404, "Account not found.");

  const result = await removeUserAvatar(viewer, id);
  if (!result.ok) return error(403, result.error);
  return NextResponse.json({ ok: true, avatarUrl: null });
}
