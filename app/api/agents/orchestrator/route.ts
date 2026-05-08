// Stackle Top-Level Orchestrator endpoint (Layer 1).
// Sonnet 4.5 conversational router. Returns JSON with narration + chips
// + extractedSignals + managerKey for routing.

export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { runStackleOrchestrator, type OrchestratorInput } from "@/lib/agents/orchestrator/runStackleOrchestrator";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 120, windowMs: 60_000 });
  if (__rl.blocked) return __rl.response;

  try {
    const body = await req.json() as Partial<OrchestratorInput>;
    const route = await runStackleOrchestrator({
      messages: body.messages ?? [],
      resumeContext: body.resumeContext,
      priorSignals: body.priorSignals,
    });
    return NextResponse.json({ route });
  } catch (err) {
    console.error("[orchestrator]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 500 });
  }
}
