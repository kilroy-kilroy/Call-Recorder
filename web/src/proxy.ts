import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  // Skip API routes that need to be accessible without browser auth
  if (
    request.nextUrl.pathname.startsWith("/api/upload") ||
    request.nextUrl.pathname.startsWith("/api/transcribe-callback") ||
    request.nextUrl.pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  // Check for auth cookie
  const authCookie = request.cookies.get("auth");
  if (authCookie?.value === "true") {
    return NextResponse.next();
  }

  // If requesting a page, redirect to login
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.rewrite(loginUrl);
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
