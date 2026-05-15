// Vercel Pro allows up to 300s — gives Sonnet room to finish full analyses without cutoff.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { runResumeExtraction } from "@/lib/agents/resume/runResumeExtraction";
import { rateLimit } from "@/lib/rateLimit";
import { flowIdFromHeaders, flowStart } from "@/lib/flowLog";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 6, windowMs: 60000 });
  if (__rl.blocked) return __rl.response;
  const flowId = flowIdFromHeaders(req.headers);
  const { resumeText } = await req.json();
  const log = flowStart("extract", flowId, { from: "server", bytes: resumeText?.length ?? 0 });

  if (!resumeText) {
    log.err(new Error("resumeText missing"));
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
    log.err(new Error("fallback extraction"));
    return NextResponse.json(
      { error: "Couldn't extract structured data from this resume. The file may be image-only, password-protected, or in an unsupported format." },
      { status: 500 }
    );
  }

  log.end({
    name: extraction.name ?? null,
    experiences: extraction.experience?.length ?? 0,
    skillGroups: extraction.skillGroups?.length ?? 0,
  });
  return NextResponse.json(extraction);
}
