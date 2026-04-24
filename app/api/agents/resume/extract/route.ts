// Vercel Pro allows up to 300s — gives Sonnet room to finish full analyses without cutoff.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { runResumeExtraction } from "@/lib/agents/resume/runResumeExtraction";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 6, windowMs: 60000 });
  if (__rl.blocked) return __rl.response;
  const { resumeText } = await req.json();
  console.log('EXTRACT RECEIVED:', resumeText?.length);

  if (!resumeText) {
    return NextResponse.json({ error: "resumeText is required" }, { status: 400 });
  }

  const extraction = await runResumeExtraction({ resumeText });
  return NextResponse.json(extraction);
}
