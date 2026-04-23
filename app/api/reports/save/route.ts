import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { report_data, extraction_data, candidate_name, score } = body;

    if (!report_data) {
      return NextResponse.json({ error: "report_data required" }, { status: 400 });
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
