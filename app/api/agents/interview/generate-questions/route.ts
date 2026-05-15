// On-demand question generator for Interview Prep.
//
// Replaces the static question bank's dead end for non-SQL skills.
// Client calls this when a drill session starts; we generate N
// interview questions for {skill, difficulty}, optionally grounded
// in the user's resume.

export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { generateQuestions } from "@/lib/agents/interview/runQuestionGenerator";
import { rateLimit } from "@/lib/rateLimit";
import { flowIdFromHeaders, flowStart } from "@/lib/flowLog";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 12, windowMs: 60_000 });
  if (__rl.blocked) return __rl.response;

  const flowId = flowIdFromHeaders(req.headers);
  try {
    const body = await req.json();
    const { skill, difficulty, count, resumeContext } = body ?? {};

    const log = flowStart("synthesize", flowId, {
      from: "question-gen",
      skill,
      difficulty,
      count,
      hasResume: !!resumeContext,
    });

    if (typeof skill !== "string" || !skill.trim()) {
      log.err(new Error("skill required"));
      return NextResponse.json({ error: "skill is required" }, { status: 400 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      log.err(new Error("missing api key"));
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    const validDifficulties = ["easy", "medium", "hard", "mixed"];
    const diff = typeof difficulty === "string" && validDifficulties.includes(difficulty)
      ? (difficulty as "easy" | "medium" | "hard" | "mixed")
      : "medium";
    const safeCount = typeof count === "number" && Number.isFinite(count)
      ? Math.max(1, Math.min(20, Math.floor(count)))
      : 3;

    const questions = await generateQuestions({
      skill: skill.trim(),
      difficulty: diff,
      count: safeCount,
      resumeContext: resumeContext ?? null,
    });
    log.end({ produced: questions.length });
    return NextResponse.json({ questions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[flow:synthesize] ERR id=${flowId} from=question-gen err="${message}"`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
