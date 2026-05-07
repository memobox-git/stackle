// Layer-1 Stackle Orchestrator endpoint. Haiku 4.5 router. Returns JSON
// with {managerKey, narration, chips?}. Called on the FIRST message of a
// new chat (or on detected domain switch).
//
// NOT to be confused with /api/agents/resume-orchestrator which is the
// Resume Manager's internal orchestrator (Layer 2/3).

export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { runStackleOrchestrator } from "@/lib/agents/orchestrator/runStackleOrchestrator";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 120, windowMs: 60_000 });
  if (__rl.blocked) return __rl.response;

  try {
    const body = await req.json() as { message?: string; history?: { role: "user" | "assistant"; content: string }[] };
    const route = await runStackleOrchestrator({
      message: body.message ?? "",
      history: body.history,
    });
    return NextResponse.json({ route });
  } catch (err) {
    console.error("[orchestrator]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 500 });
  }
}
