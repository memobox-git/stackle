// Interview verdict evaluation endpoint. Phase 1 — single-question
// evaluation. Future endpoints (start-session, get-live-reaction,
// end-session, get-forecast) live in sibling directories.

export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { runEvaluator } from "@/lib/agents/interview/runEvaluator";
import { getQuestionById } from "@/lib/agents/interview/questionBank";
import type { InterviewQuestion } from "@/lib/agents/interview/questionBank/types";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (__rl.blocked) return __rl.response;

  try {
    const body = await req.json() as { questionId?: string; question?: InterviewQuestion; answer?: string };
    if (typeof body.answer !== "string") {
      return NextResponse.json({ error: "answer is required" }, { status: 400 });
    }

    // Two paths: a static-bank question (looked up by id) OR a
    // dynamically-generated question (passed inline). Generated
    // questions have ids like "gen-..." that don't exist in the bank.
    let question: InterviewQuestion | null = null;
    if (body.question && body.question.prompt) {
      question = body.question;
    } else if (body.questionId) {
      question = getQuestionById(body.questionId);
    }

    if (!question) {
      return NextResponse.json({ error: `unknown question (id=${body.questionId ?? "n/a"})` }, { status: 404 });
    }

    const evaluation = await runEvaluator(question, body.answer);
    return NextResponse.json({ evaluation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[interview/evaluate]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
