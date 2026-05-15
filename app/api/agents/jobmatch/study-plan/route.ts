// POST /api/agents/jobmatch/study-plan
//
// Input: { jobMatchId }
// Output: { plan: StudyPlan }
//
// Reads parsed_jd + cached match analysis (if any), runs the study
// plan generator, caches result in job_match_outputs.

export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { runStudyPlanGen } from "@/lib/agents/jobmatch/runStudyPlanGen";
import type { JDAnalysis } from "@/lib/agents/jd/runJDAnalyzer";
import type { MatchAnalysis } from "@/lib/agents/jobmatch/runMatchAnalyzer";
import { rateLimit } from "@/lib/rateLimit";
import { flowIdFromHeaders, flowStart } from "@/lib/flowLog";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 8, windowMs: 60_000 });
  if (__rl.blocked) return __rl.response;

  const flowId = flowIdFromHeaders(req.headers);
  const log = flowStart("synthesize", flowId, { from: "jobmatch-study-plan" });

  try {
    const body = await req.json() as { jobMatchId?: string };
    if (!body.jobMatchId) {
      log.err(new Error("jobMatchId required"));
      return NextResponse.json({ error: "jobMatchId is required" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );

    // Cache check.
    const { data: existing } = await supabase
      .from("job_match_outputs")
      .select("content")
      .eq("job_match_id", body.jobMatchId)
      .eq("output_type", "study")
      .maybeSingle();
    if (existing?.content) {
      log.end({ cache: "hit" });
      return NextResponse.json({ plan: existing.content });
    }

    // Pull JD + (optional) match analysis.
    const { data: jm, error: jmErr } = await supabase
      .from("job_matches")
      .select("parsed_jd")
      .eq("id", body.jobMatchId)
      .maybeSingle();
    if (jmErr || !jm?.parsed_jd) {
      log.err(new Error("job match not found"));
      return NextResponse.json({ error: "Job Match not found or not parsed yet" }, { status: 404 });
    }

    const { data: matchRow } = await supabase
      .from("job_match_outputs")
      .select("content")
      .eq("job_match_id", body.jobMatchId)
      .eq("output_type", "match")
      .maybeSingle();
    const matchAnalysis: MatchAnalysis | null = matchRow?.content
      ? (matchRow.content as MatchAnalysis)
      : null;

    const plan = await runStudyPlanGen({
      parsedJd: jm.parsed_jd as JDAnalysis,
      matchAnalysis,
    });

    await supabase
      .from("job_match_outputs")
      .upsert(
        {
          job_match_id: body.jobMatchId,
          output_type: "study",
          content: plan,
          model_used: "claude-sonnet-4-5",
          generated_at: new Date().toISOString(),
        },
        { onConflict: "job_match_id,output_type" },
      );

    log.end({ items: plan.items.length });
    return NextResponse.json({ plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[flow:synthesize] ERR id=${flowId} from=jobmatch-study-plan err="${message}"`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
