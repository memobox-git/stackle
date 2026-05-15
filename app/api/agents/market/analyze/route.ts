// Vercel Pro allows up to 300s — gives Sonnet room to finish full analyses without cutoff.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { runMarketIntelligence } from "@/lib/agents/market/runMarketIntelligence";
import { rateLimit } from "@/lib/rateLimit";
import { flowIdFromHeaders, flowStart } from "@/lib/flowLog";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 8, windowMs: 60000 });
  if (__rl.blocked) return __rl.response;
  const flowId = flowIdFromHeaders(req.headers);
  const { targetRole, location, seniority, messages } = await req.json();
  const log = flowStart("market", flowId, { from: "server", targetRole, location, seniority });

  if (!targetRole) {
    log.err(new Error("targetRole missing"));
    return NextResponse.json({ error: "targetRole is required" }, { status: 400 });
  }

  try {
    const analysis = await runMarketIntelligence({ targetRole, location, seniority, messages });
    log.end({ trends: (analysis as { keyTrends?: unknown[] }).keyTrends?.length ?? 0 });
    return NextResponse.json(analysis);
  } catch (err) {
    log.err(err);
    throw err;
  }
}
