// Verdict evaluator runner. Sonnet 4.5. Takes a question + answer and
// returns a structured InterviewEvaluation.

import Anthropic from "@anthropic-ai/sdk";
import { VERDICT_EVALUATOR_SYSTEM_PROMPT } from "./prompts/verdictEvaluatorPrompt";
import type { InterviewQuestion, InterviewEvaluation, Verdict } from "./questionBank/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VALID_VERDICTS: Verdict[] = ["strong_hire", "hire", "soft_pass", "no_hire"];

export async function runEvaluator(
  question: InterviewQuestion,
  answer: string,
): Promise<InterviewEvaluation> {
  const trimmedAnswer = (answer ?? "").trim();
  // Short-circuit empty answers — no need to spend an API call.
  if (!trimmedAnswer || trimmedAnswer.length < 5) {
    return {
      verdict: "no_hire",
      score: 0,
      reasoning: "No answer submitted.",
      whatWorked: [],
      whatMissed: ["The answer was blank or trivially short."],
      pushToStrong: "Take a real attempt — even a partial query gets you to soft_pass.",
    };
  }

  const userMessage = [
    `# Question`,
    question.prompt,
    "",
    `# Context`,
    question.contextSetup,
    "",
    `# Sample data`,
    question.sampleData,
    "",
    `# Rubric`,
    `correctApproach: ${question.rubric.correctApproach}`,
    `commonMistakes:\n${question.rubric.commonMistakes.map((m) => `  - ${m}`).join("\n")}`,
    `bonusPoints:\n${question.rubric.bonusPoints.map((b) => `  - ${b}`).join("\n")}`,
    `traps:\n${question.rubric.traps.map((t) => `  - ${t}`).join("\n")}`,
    `expectedKeywords: ${question.expectedKeywords.join(", ")}`,
    "",
    `# Candidate's answer`,
    "```",
    trimmedAnswer,
    "```",
    "",
    "Evaluate per the system prompt and return JSON only.",
  ].join("\n");

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      system: VERDICT_EVALUATOR_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    let raw = response.content[0]?.type === "text" ? response.content[0].text : "";
    raw = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

    const parsed = JSON.parse(raw) as Partial<InterviewEvaluation>;

    // Defensive shape — validate verdict and clamp score.
    const verdict: Verdict = VALID_VERDICTS.includes(parsed.verdict as Verdict)
      ? (parsed.verdict as Verdict)
      : "soft_pass";
    const score = typeof parsed.score === "number"
      ? Math.max(0, Math.min(100, Math.round(parsed.score)))
      : verdictToScore(verdict);

    return {
      verdict,
      score,
      reasoning: parsed.reasoning ?? "Evaluated.",
      whatWorked: Array.isArray(parsed.whatWorked) ? parsed.whatWorked.filter((s): s is string => typeof s === "string") : [],
      whatMissed: Array.isArray(parsed.whatMissed) ? parsed.whatMissed.filter((s): s is string => typeof s === "string") : [],
      pushToStrong: parsed.pushToStrong ?? "Tighten the approach against the rubric and try again.",
    };
  } catch (err) {
    console.error("[interview/evaluator] failed:", err);
    return {
      verdict: "soft_pass",
      score: 55,
      reasoning: "Evaluation hit a snag — your answer was received but couldn't be fully scored.",
      whatWorked: [],
      whatMissed: [],
      pushToStrong: "Try again — temporary scoring outage.",
    };
  }
}

function verdictToScore(v: Verdict): number {
  switch (v) {
    case "strong_hire": return 92;
    case "hire": return 77;
    case "soft_pass": return 60;
    case "no_hire": return 30;
  }
}
