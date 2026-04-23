import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Lazy client — creating at module-load crashes the build step when
// NEXT_PUBLIC_SUPABASE_URL isn't present at "collect page data" time
// (e.g. first Netlify build before env vars are wired up).
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { report_data, extraction_data, candidate_name, score } = body;

    if (!report_data) {
      return NextResponse.json({ error: "report_data required" }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase not configured on server" }, { status: 503 });
    }

    const { data, error } = await supabase
      .from("reports")
      .insert({ report_data, extraction_data: extraction_data ?? null, candidate_name: candidate_name ?? null, score: score ?? null })
      .select("id")
      .single();

    if (error) throw error;

    return NextResponse.json({ id: data.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
