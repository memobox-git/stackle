import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Honour the `next` query param so users land back on the page they
  // tried to reach before middleware bounced them to /signin.
  const nextParam = searchParams.get("next") || "/";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Defensive: only redirect to relative paths within the app. An
  // external URL in `next` would be an open-redirect vector.
  const safeNext = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
