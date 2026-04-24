// Vercel Pro allows up to 300s — gives Sonnet room to finish full analyses without cutoff.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { runResumeIntelligence } from "@/lib/agents/resume/runResumeIntelligence";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 6, windowMs: 60000 });
  if (__rl.blocked) return __rl.response;

  try {
    const { resumeText, targetRole, messages, reviewType, targetMarket, seniorityLevel, jobDescription } = await req.json();
    console.log('ANALYZE RECEIVED:', resumeText?.length);
    console.log('INTAKE CONTEXT:', { reviewType, targetMarket, seniorityLevel });

    if (!resumeText) {
      return NextResponse.json({ error: "resumeText is required" }, { status: 400 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
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
    return NextResponse.json(analysis);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[analyze] Route error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
