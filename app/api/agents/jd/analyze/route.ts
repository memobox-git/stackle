// JD Analyzer endpoint. POST { jdText } → JDAnalysis JSON.

export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { runJDAnalyzer } from "@/lib/agents/jd/runJDAnalyzer";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (__rl.blocked) return __rl.response;

  try {
    const body = await req.json() as { jdText?: string };
    if (!body.jdText) return NextResponse.json({ error: "jdText required" }, { status: 400 });
    const analysis = await runJDAnalyzer(body.jdText);
    return NextResponse.json({ analysis });
  } catch (err) {
    console.error("[jd/analyze]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 500 });
  }
}
