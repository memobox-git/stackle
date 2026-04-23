import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const LIMIT = 1000; // bump for dev — set back to 10 for production

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { count } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({ count: count ?? 0, limitReached: (count ?? 0) >= LIMIT });
}
