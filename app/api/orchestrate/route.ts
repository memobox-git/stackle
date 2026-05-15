// Vercel Pro allows up to 300s — gives Sonnet room to finish full analyses without cutoff.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { runOrchestrator } from "@/lib/agents/orchestrator/runOrchestrator";
import { rateLimit } from "@/lib/rateLimit";
import { flowIdFromHeaders, flowStart } from "@/lib/flowLog";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 40, windowMs: 60000 });
  if (__rl.blocked) return __rl.response;
  const flowId = flowIdFromHeaders(req.headers);
  const { messages, resumeText } = await req.json();
  const log = flowStart("orchestrate", flowId, {
    from: "server",
    msgs: messages?.length ?? 0,
    hasResume: !!resumeText,
  });
  try {
    const decision = await runOrchestrator({ messages, resumeText: resumeText ?? null });
    log.end({
      runResumeIntelligence: decision.runResumeIntelligence,
      runMarketIntelligence: decision.runMarketIntelligence,
      runInterviewPrep: decision.runInterviewPrep,
      targetRole: decision.detectedTargetRole,
    });
    return NextResponse.json(decision);
  } catch (err) {
    log.err(err);
    throw err;
  }
}
