// Vercel Pro allows up to 300s — gives Sonnet room to finish full analyses without cutoff.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { runStackleOrchestrator } from "@/lib/agents/orchestrator/runStackleOrchestrator";
import { DEFAULT_ORCHESTRATOR_DECISION, type OrchestratorDecision } from "@/lib/agents/schemas/orchestrator";
import { rateLimit } from "@/lib/rateLimit";
import { flowIdFromHeaders, flowStart } from "@/lib/flowLog";

// Surgical fix for the two-orchestrator architecture. The route URL +
// response shape are unchanged so /api/orchestrate consumers (sendMessage
// in app/page.tsx, the orchestratorDecision state, Steps 2-5 downstream)
// see no behavior change. Internally we now call the SAME Stackle
// orchestrator that Resume Builder uses, then ADAPT its route output
// into the legacy OrchestratorDecision shape.
//
// Mapping:
//   managerKey === "resume"    → runResumeIntelligence: true
//   managerKey === "interview" → runInterviewPrep: true
//   extractedSignals.role      → detectedTargetRole
//   extractedSignals.seniority → detectedSeniority (lowercased)
//   runMarketIntelligence stays false here — the Stackle orchestrator
//   doesn't track market intel as a separate flag; users who want it
//   trigger it explicitly. This is a small regression in chat-mode auto
//   market triggering, accepted in exchange for orchestrator unification.

function toLegacyDecision(route: Awaited<ReturnType<typeof runStackleOrchestrator>>): OrchestratorDecision {
  const { managerKey, extractedSignals } = route;
  return {
    ...DEFAULT_ORCHESTRATOR_DECISION,
    runResumeIntelligence: managerKey === "resume",
    runMarketIntelligence: false,
    runInterviewPrep: managerKey === "interview",
    detectedTargetRole: extractedSignals.role ?? null,
    detectedSeniority: extractedSignals.seniority ?? null,
    detectedLocation: null,
    detectedInterviewType: null,
  };
}

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
    // Stackle orchestrator wants typed message roles. Filter the legacy
    // mixed-string shape down to user/assistant only.
    const stackleMsgs = (messages ?? [])
      .filter((m: { role: string }) => m.role === "user" || m.role === "assistant")
      .map((m: { role: "user" | "assistant"; content: string }) => ({ role: m.role, content: m.content }));
    // Minimal resumeContext from raw resume text — the Stackle agent's
    // smart fallback uses it. Light summary only; we don't have parsed
    // extraction at this route boundary.
    const resumeContext = resumeText
      ? { summary: typeof resumeText === "string" ? resumeText.slice(0, 1200) : undefined }
      : undefined;
    const route = await runStackleOrchestrator({ messages: stackleMsgs, resumeContext });
    const decision = toLegacyDecision(route);
    log.end({
      managerKey: route.managerKey,
      runResumeIntelligence: decision.runResumeIntelligence,
      runInterviewPrep: decision.runInterviewPrep,
      targetRole: decision.detectedTargetRole,
    });
    return NextResponse.json(decision);
  } catch (err) {
    log.err(err);
    throw err;
  }
}
