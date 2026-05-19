import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Public paths
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/warm" ||           // cache-warmer cron, guarded by its own WARM_SECRET
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) return NextResponse.next();

  const cookie = req.cookies.get("blinkit-fleet-session");
  if (!cookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
