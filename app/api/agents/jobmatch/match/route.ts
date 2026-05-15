// POST /api/agents/jobmatch/match
//
// Input: { jobMatchId: string; resumeExtraction: ResumeExtraction }
// Output: { analysis: MatchAnalysis }
//
// Runs the match analyzer against the saved job_matches row's parsed_jd
// + the supplied resume. Caches the result in job_match_outputs so a
// re-open of the same Job Match doesn't re-burn the call.

export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { runMatchAnalyzer } from "@/lib/agents/jobmatch/runMatchAnalyzer";
import type { JDAnalysis } from "@/lib/agents/jd/runJDAnalyzer";
import type { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import { rateLimit } from "@/lib/rateLimit";
import { flowIdFromHeaders, flowStart } from "@/lib/flowLog";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 10, windowMs: 60_000 });
  if (__rl.blocked) return __rl.response;

  const flowId = flowIdFromHeaders(req.headers);
  const log = flowStart("synthesize", flowId, { from: "jobmatch-match" });

  try {
    const body = await req.json() as {
      jobMatchId?: string;
      resumeExtraction?: ResumeExtraction;
    };
    if (!body.jobMatchId || !body.resumeExtraction) {
      log.err(new Error("jobMatchId + resumeExtraction required"));
      return NextResponse.json({ error: "jobMatchId and resumeExtraction are required" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );

    // Cache check — if we already have a match output for this Job
    // Match, return it without re-running the analyzer.
    const { data: existing } = await supabase
      .from("job_match_outputs")
      .select("content")
      .eq("job_match_id", body.jobMatchId)
      .eq("output_type", "match")
      .maybeSingle();
    if (existing?.content) {
      log.end({ cache: "hit" });
      return NextResponse.json({ analysis: existing.content });
    }

    // Pull the parsed JD from the saved row.
    const { data: jm, error: jmErr } = await supabase
      .from("job_matches")
      .select("parsed_jd")
      .eq("id", body.jobMatchId)
      .maybeSingle();
    if (jmErr || !jm?.parsed_jd) {
      log.err(new Error("job match not found or missing parsed_jd"));
      return NextResponse.json({ error: "Job Match not found or not parsed yet" }, { status: 404 });
    }

    const analysis = await runMatchAnalyzer({
      parsedJd: jm.parsed_jd as JDAnalysis,
      resume: body.resumeExtraction,
    });

    // Persist to cache so reopening this Job Match returns instantly.
    await supabase
      .from("job_match_outputs")
      .upsert(
        {
          job_match_id: body.jobMatchId,
          output_type: "match",
          content: analysis,
          model_used: "claude-sonnet-4-5",
          generated_at: new Date().toISOString(),
        },
        { onConflict: "job_match_id,output_type" },
      );

    log.end({ score: analysis.score, verdict: analysis.verdict });
    return NextResponse.json({ analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[flow:synthesize] ERR id=${flowId} from=jobmatch-match err="${message}"`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
