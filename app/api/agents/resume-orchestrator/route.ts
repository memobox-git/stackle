// Resume Builder chat orchestrator endpoint. Sonnet 4.5 with tool use.
// Streams narration tokens + tool calls back to the client as SSE.
//
// The client (app/page.tsx + ResumeBuilder) executes tool calls locally —
// most of them are panel-control (show_panel, highlight_section) or
// dispatch into existing per-feature endpoints (apply_fix → /api/agents/resume/edit
// pipeline). The orchestrator never executes resume edits server-side.
export const maxDuration = 300;

import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import {
  runResumeOrchestrator,
  DEFAULT_CONVERSATION_STATE,
  type ConversationState,
} from "@/lib/agents/orchestrator/runResumeOrchestrator";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 60, windowMs: 60_000 });
  if (__rl.blocked) return __rl.response;

  const body = await req.json();
  const messages = (body.messages ?? []) as { role: "user" | "assistant"; content: string }[];
  const extraction = body.extraction ?? null;
  const analysis = body.analysis ?? null;
  const state = (body.state ?? DEFAULT_CONVERSATION_STATE) as ConversationState;
  const currentScore = typeof body.currentScore === "number" ? body.currentScore : null;
  const originalScore = typeof body.originalScore === "number" ? body.originalScore : null;

  const stream = await runResumeOrchestrator({
    messages,
    extraction,
    analysis,
    state,
    currentScore,
    originalScore,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
