// Vercel Pro 300s timeout. Opus 4.5 typically lands at 60-90s for whole-
// resume rewrites; 300s gives headroom for edge cases.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { runRewriteAll } from "@/lib/agents/resume/runRewriteAll";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 4, windowMs: 60_000 });
  if (__rl.blocked) return __rl.response;

  try {
    const body = await req.json();
    const { extraction, analysis, targetRole, jobDescription, styleHint } = body ?? {};

    if (!extraction || !analysis || !targetRole) {
      return NextResponse.json(
        { error: "extraction, analysis, and targetRole are required" },
        { status: 400 },
      );
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured on the server." },
        { status: 500 },
      );
    }

    const result = await runRewriteAll({
      extraction,
      analysis,
      targetRole,
      jobDescription,
      styleHint,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[rewrite-all] Route error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
