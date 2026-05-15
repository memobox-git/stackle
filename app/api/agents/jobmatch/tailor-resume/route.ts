// POST /api/agents/jobmatch/tailor-resume
//
// Input: { jobMatchId, resumeExtraction, priorAnalysis? }
// Output: { tailored: ResumeExtraction, changedKeys: string[] }
//
// Pulls the saved parsed_jd + raw_jd_text for the job match, runs
// runJDTailoredResume (which wraps runRewriteAll with JD context),
// and caches the tailored extraction in job_match_outputs so the
// next open returns instantly.

export const maxDuration = 300; // Opus rewrites take 60-90s.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { runJDTailoredResume } from "@/lib/agents/jobmatch/runJDTailoredResume";
import type { JDAnalysis } from "@/lib/agents/jd/runJDAnalyzer";
import type { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import type { ResumeAnalysis } from "@/lib/agents/schemas/resumeIntelligence";
import type { MatchAnalysis } from "@/lib/agents/jobmatch/runMatchAnalyzer";
import { rateLimit } from "@/lib/rateLimit";
import { flowIdFromHeaders, flowStart } from "@/lib/flowLog";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 4, windowMs: 60_000 });
  if (__rl.blocked) return __rl.response;

  const flowId = flowIdFromHeaders(req.headers);
  const log = flowStart("synthesize", flowId, { from: "jobmatch-tailor-resume" });

  try {
    const body = await req.json() as {
      jobMatchId?: string;
      resumeExtraction?: ResumeExtraction;
      priorAnalysis?: ResumeAnalysis | null;
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

    // Cache check.
    const { data: existing } = await supabase
      .from("job_match_outputs")
      .select("content")
      .eq("job_match_id", body.jobMatchId)
      .eq("output_type", "resume")
      .maybeSingle();
    if (existing?.content) {
      log.end({ cache: "hit" });
      return NextResponse.json(existing.content);
    }

    // Pull JD + match analysis (if any) from saved rows.
    const { data: jm, error: jmErr } = await supabase
      .from("job_matches")
      .select("parsed_jd, raw_jd_text")
      .eq("id", body.jobMatchId)
      .maybeSingle();
    if (jmErr || !jm?.parsed_jd) {
      log.err(new Error("job match not found or missing parsed_jd"));
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

    const out = await runJDTailoredResume({
      extraction: body.resumeExtraction,
      parsedJd: jm.parsed_jd as JDAnalysis,
      rawJdText: (jm.raw_jd_text as string) ?? "",
      matchAnalysis,
      priorAnalysis: body.priorAnalysis ?? null,
    });

    // Cache.
    const payload = {
      tailored: out.extraction,
      changedKeys: out.changedKeys,
      qualityWarnings: out.qualityWarnings ?? [],
    };
    await supabase
      .from("job_match_outputs")
      .upsert(
        {
          job_match_id: body.jobMatchId,
          output_type: "resume",
          content: payload,
          model_used: "claude-opus-4-5",
          generated_at: new Date().toISOString(),
        },
        { onConflict: "job_match_id,output_type" },
      );

    log.end({ changedKeys: out.changedKeys.length });
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[flow:synthesize] ERR id=${flowId} from=jobmatch-tailor-resume err="${message}"`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
