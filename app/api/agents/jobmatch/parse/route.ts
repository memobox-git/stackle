// POST /api/agents/jobmatch/parse
//
// Input: { input: string }  — URL or raw JD text.
// Output: { jobMatch: JobMatch }
//
// Detects URL vs text, scrapes if needed, parses with JDAnalyzer,
// persists a job_matches row scoped to the authenticated user, and
// returns the row. Status is set to "ready" when parsing succeeds.

export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { runJDParser } from "@/lib/agents/jobmatch/runJDParser";
import { rateLimit } from "@/lib/rateLimit";
import { flowIdFromHeaders, flowStart } from "@/lib/flowLog";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 12, windowMs: 60_000 });
  if (__rl.blocked) return __rl.response;

  const flowId = flowIdFromHeaders(req.headers);
  const log = flowStart("synthesize", flowId, { from: "jobmatch-parse" });

  try {
    const body = await req.json() as { input?: string };
    const input = body.input?.trim();
    if (!input) {
      log.err(new Error("input missing"));
      return NextResponse.json({ error: "input is required" }, { status: 400 });
    }

    // Parse JD (scrape + analyze).
    const { jdText, sourceUrl, parsed } = await runJDParser(input);

    // Auth → persist scoped to user.
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      log.err(new Error("not authenticated"));
      return NextResponse.json({ error: "auth required" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("job_matches")
      .insert({
        user_id: user.id,
        url: sourceUrl,
        raw_jd_text: jdText,
        company: parsed.company,
        role: parsed.role,
        location: parsed.location,
        seniority_level: parsed.seniority,
        parsed_jd: parsed,
        status: "ready",
        resume_snapshot_id: null,
      })
      .select()
      .single();

    if (error) {
      log.err(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    log.end({ role: parsed.role, company: parsed.company });
    return NextResponse.json({ jobMatch: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[flow:synthesize] ERR id=${flowId} from=jobmatch-parse err="${message}"`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
