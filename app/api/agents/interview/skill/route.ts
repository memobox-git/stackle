// Skill Agent SSE endpoint. Streams Sonnet 4.5 with tool use.

export const maxDuration = 60;

import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { runSkillAgent, type SkillAgentInput } from "@/lib/agents/interview/runSkillAgent";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 60, windowMs: 60_000 });
  if (__rl.blocked) return __rl.response;

  const body = await req.json() as Partial<SkillAgentInput>;
  const stream = await runSkillAgent({
    messages: body.messages ?? [],
    sessionState: body.sessionState ?? { phase: "lens", config: {} },
    profileSeed: body.profileSeed ?? null,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
