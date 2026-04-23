// Bumped from default 10s to 60s — LLM calls routinely take 15-45s.
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { runOrchestrator } from "@/lib/agents/orchestrator/runOrchestrator";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 40, windowMs: 60000 });
  if (__rl.blocked) return __rl.response;
  const { messages, resumeText } = await req.json();
  const decision = await runOrchestrator({ messages, resumeText: resumeText ?? null });
  return NextResponse.json(decision);
}
