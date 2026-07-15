import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((req) => {
  // The homepage stays public so visitors can see what Marquee is before
  // creating an account — everything else requires signing in.
  if (req.nextUrl.pathname === "/") return NextResponse.next();

  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = {
  matcher: [
    "/((?!api/auth|login|setup|_next/static|_next/image|favicon.ico|icon|apple-icon).*)",
  ],
};
