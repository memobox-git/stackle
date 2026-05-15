// Vercel Pro allows up to 300s — gives Sonnet room to finish full analyses without cutoff.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { runResumeIntelligence } from "@/lib/agents/resume/runResumeIntelligence";
import { rateLimit } from "@/lib/rateLimit";
import { flowIdFromHeaders, flowStart } from "@/lib/flowLog";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 6, windowMs: 60000 });
  if (__rl.blocked) return __rl.response;
  const flowId = flowIdFromHeaders(req.headers);

  try {
    const { resumeText, targetRole, messages, reviewType, targetMarket, seniorityLevel, jobDescription } = await req.json();
    const log = flowStart("analyze", flowId, {
      from: "server",
      bytes: resumeText?.length ?? 0,
      targetRole, reviewType, targetMarket, seniorityLevel,
    });

    if (!resumeText) {
      log.err(new Error("resumeText missing"));
      return NextResponse.json({ error: "resumeText is required" }, { status: 400 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      log.err(new Error("missing api key"));
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured on the server." },
        { status: 500 },
      );
    }

    const analysis = await runResumeIntelligence({
      resumeText,
      targetRole,
      messages,
      reviewType,
      targetMarket,
      seniorityLevel,
      jobDescription,
    });
    log.end({
      priorities: analysis.rewritePriorities?.length ?? 0,
      gaps: analysis.keywordGaps?.length ?? 0,
      strengths: analysis.strengths?.length ?? 0,
    });
    return NextResponse.json(analysis);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[flow:analyze] ERR   id=${flowId} err="${message}"`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
