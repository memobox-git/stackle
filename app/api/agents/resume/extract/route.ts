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

  // Hard-fail when extraction returned the sentinel fallback. Empty name +
  // empty experience + empty skills means Sonnet failed (parse error, API
  // hiccup, image-only PDF, etc.) — surface a 500 so the client shows the
  // inline error UI instead of advancing to chat with placeholder data.
  const isFallback =
    (!extraction.name || extraction.name.trim().length === 0) &&
    (!extraction.experience || extraction.experience.length === 0) &&
    (!extraction.skillGroups || extraction.skillGroups.length === 0);

  if (isFallback) {
    console.error("[extract] extraction returned fallback — failing request. resumeText length:", resumeText.length);
    return NextResponse.json(
      { error: "Couldn't extract structured data from this resume. The file may be image-only, password-protected, or in an unsupported format." },
      { status: 500 }
    );
  }

  return NextResponse.json(extraction);
}
