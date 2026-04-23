// Bumped from default 10s to 60s — LLM calls routinely take 15-45s.
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { runResumeIntelligence } from "@/lib/agents/resume/runResumeIntelligence";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 6, windowMs: 60000 });
  if (__rl.blocked) return __rl.response;
  const { resumeText, targetRole, messages, reviewType, targetMarket, seniorityLevel, jobDescription } = await req.json();
  console.log('ANALYZE RECEIVED:', resumeText?.length);
  console.log('INTAKE CONTEXT:', { reviewType, targetMarket, seniorityLevel });

  if (!resumeText) {
    return NextResponse.json({ error: "resumeText is required" }, { status: 400 });
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
  return NextResponse.json(analysis);
}
