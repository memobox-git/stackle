// Bumped from default 10s to 60s — LLM calls routinely take 15-45s.
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { runInterviewPrep } from "@/lib/agents/interview/runInterviewPrep";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 8, windowMs: 60000 });
  if (__rl.blocked) return __rl.response;
  const { role, level, interviewType, resumeText } = await req.json();

  if (!role || !level || !interviewType) {
    return NextResponse.json(
      { error: "role, level, and interviewType are required" },
      { status: 400 }
    );
  }

  const plan = await runInterviewPrep({ role, level, interviewType, resumeText });
  return NextResponse.json(plan);
}
