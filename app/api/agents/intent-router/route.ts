// POST /api/agents/intent-router
//
// Input:  { message: string }
// Output: { route: IntentRoute | null }
//
// Server-side wrapper so the Haiku call doesn't ship the API key
// to the browser. Returns null when the message isn't classifiable
// as an actionable intent.

export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { classifyIntent } from "@/lib/agents/intentRouter";
import { rateLimit } from "@/lib/rateLimit";
import { flowIdFromHeaders, flowStart } from "@/lib/flowLog";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 60, windowMs: 60_000 });
  if (__rl.blocked) return __rl.response;

  const flowId = flowIdFromHeaders(req.headers);
  const log = flowStart("synthesize", flowId, { from: "intent-router" });

  try {
    const body = await req.json() as { message?: string };
    const message = body.message?.trim();
    if (!message) {
      log.end({ category: "noop", reason: "empty message" });
      return NextResponse.json({ route: null });
    }

    const route = await classifyIntent(message);
    log.end({ category: route?.category ?? "null" });
    return NextResponse.json({ route });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[flow:intent-router] ERR id=${flowId} err="${message}"`);
    // Return null route on error so the caller falls back to the
    // regular flow. Intent routing is opportunistic — failures here
    // should NEVER block the chat.
    return NextResponse.json({ route: null });
  }
}
