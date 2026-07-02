import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = ["/sign-in", "/api/auth", "/forgot-password", "/reset-password"];

/**
 * Forwards the request pathname as `x-pathname` so server components can
 * read it from headers() without doing the request-rewrite dance. Used by
 * the (app) layout to enforce the external_diligence route guard.
 */
function withPathHeader(res: NextResponse, pathname: string) {
  res.headers.set("x-pathname", pathname);
  return res;
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") return NextResponse.next();

  // Use getToken (JWT-only, Edge-compatible) instead of auth() which pulls
  // in bcryptjs and breaks in the Edge runtime.
  // secureCookie must match what NextAuth uses when minting the JWT.
  // On HTTPS (production) it sets __Secure-authjs.session-token; on HTTP
  // (local dev) it sets authjs.session-token. The salt for the derived
  // encryption key is the cookie name, so both must agree.
  const secureCookie = req.nextUrl.protocol === "https:";
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie,
  });

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  return withPathHeader(
    NextResponse.next({
      request: { headers: new Headers({ ...Object.fromEntries(req.headers), "x-pathname": pathname }) },
    }),
    pathname,
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
