// Stackle V2 — auth gate.
//
// Public routes: / (landing), /signin, /signup, /auth/callback, static
// assets, /api/* (each route enforces its own auth via Supabase server
// client; we don't gate API routes at middleware level so OAuth callbacks
// and webhook-style endpoints stay reachable).
//
// Everything else: requires an authenticated Supabase session. Otherwise
// 302 → /signin?next=<original-path>.

import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = new Set([
  "/",
  "/signin",
  "/signup",
]);

const PUBLIC_PREFIXES = [
  "/auth/",        // /auth/callback, /auth/confirm, etc.
  "/api/",         // API routes self-gate
  "/_next/",
  "/favicon",
  "/share/",       // future: shared resume / report public links
  "/shared-resume",
  "/report/",
  "/profile/",     // /profile/{username} is public; /profile/setup self-gates
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  // Files like /robots.txt, /sitemap.xml — let through.
  if (/\.[a-z0-9]+$/i.test(pathname)) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  // Check Supabase session via SSR cookies. We use a no-op response so
  // the cookies adapter has somewhere to write refreshed tokens to.
  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  // Run on every route except Next.js internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
