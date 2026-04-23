// Bumped from default 10s to 60s — LLM calls routinely take 15-45s.
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { runMarketIntelligence } from "@/lib/agents/market/runMarketIntelligence";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 8, windowMs: 60000 });
  if (__rl.blocked) return __rl.response;
  const { targetRole, location, seniority, messages } = await req.json();

  if (!targetRole) {
    return NextResponse.json({ error: "targetRole is required" }, { status: 400 });
  }

  const analysis = await runMarketIntelligence({ targetRole, location, seniority, messages });
  return NextResponse.json(analysis);
}
