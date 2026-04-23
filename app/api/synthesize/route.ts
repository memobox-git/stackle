// Bumped from default 10s to 60s — LLM calls routinely take 15-45s.
export const maxDuration = 60;

import { NextRequest } from "next/server";
import { runFinalSynthesis } from "@/lib/agents/synthesize/runFinalSynthesis";
import { WorkspaceViewModel } from "@/lib/agents/schemas/workspaceViewModel";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 40, windowMs: 60000 });
  if (__rl.blocked) return __rl.response;
  const { messages, resumeText, resumeExtraction, resumeAnalysis, marketAnalysis, orchestratorDecision, interviewPrepPlan, mode } = await req.json();

  const workspace: WorkspaceViewModel = {
    conversationHistory: messages ?? [],
    resumeText: resumeText ?? null,
    resumeExtraction: resumeExtraction ?? null,
    orchestratorDecision: orchestratorDecision ?? null,
    resumeAnalysis: resumeAnalysis ?? null,
    marketAnalysis: marketAnalysis ?? null,
    interviewPrepPlan: interviewPrepPlan ?? null,
    mode: mode ?? "chat",
  };

  const stream = await runFinalSynthesis(workspace);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
