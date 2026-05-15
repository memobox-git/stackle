// POST /api/agents/jobmatch/interview-prep
//
// Input: { jobMatchId, resumeExtraction? }
// Output: { primarySkill, jdTitle, jdCompany, questions: InterviewQuestion[] }
//
// Generates 5-10 JD-tailored interview questions. Output is cached
// in job_match_outputs so re-opening returns instantly.

export const maxDuration = 180;

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { runInterviewPrepTailored } from "@/lib/agents/jobmatch/runInterviewPrepTailored";
import type { JDAnalysis } from "@/lib/agents/jd/runJDAnalyzer";
import type { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import { rateLimit } from "@/lib/rateLimit";
import { flowIdFromHeaders, flowStart } from "@/lib/flowLog";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 8, windowMs: 60_000 });
  if (__rl.blocked) return __rl.response;

  const flowId = flowIdFromHeaders(req.headers);
  const log = flowStart("synthesize", flowId, { from: "jobmatch-interview-prep" });

  try {
    const body = await req.json() as {
      jobMatchId?: string;
      resumeExtraction?: ResumeExtraction;
    };
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
      .eq("output_type", "prep")
      .maybeSingle();
    if (existing?.content) {
      log.end({ cache: "hit" });
      return NextResponse.json(existing.content);
    }

    // Pull JD + raw text.
    const { data: jm, error: jmErr } = await supabase
      .from("job_matches")
      .select("parsed_jd, raw_jd_text")
      .eq("id", body.jobMatchId)
      .maybeSingle();
    if (jmErr || !jm?.parsed_jd) {
      log.err(new Error("job match not found"));
      return NextResponse.json({ error: "Job Match not found or not parsed yet" }, { status: 404 });
    }

    const out = await runInterviewPrepTailored({
      parsedJd: jm.parsed_jd as JDAnalysis,
      rawJdText: (jm.raw_jd_text as string) ?? "",
      resume: body.resumeExtraction ?? null,
      count: 6,
    });

    await supabase
      .from("job_match_outputs")
      .upsert(
        {
          job_match_id: body.jobMatchId,
          output_type: "prep",
          content: out,
          model_used: "claude-sonnet-4-5",
          generated_at: new Date().toISOString(),
        },
        { onConflict: "job_match_id,output_type" },
      );

    log.end({ questions: out.questions.length, primarySkill: out.primarySkill });
    return NextResponse.json(out);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[flow:synthesize] ERR id=${flowId} from=jobmatch-interview-prep err="${message}"`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
