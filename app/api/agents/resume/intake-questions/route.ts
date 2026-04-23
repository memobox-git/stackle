// Bumped from default 10s to 60s — LLM calls routinely take 15-45s.
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { RESUME_INTAKE_SYSTEM_PROMPT } from "@/lib/agents/prompts/resumeIntakePrompt";
import { rateLimit } from "@/lib/rateLimit";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface IntakeQuestion {
  id: string;
  text: string;
  chips: string[] | null;
}

export interface IntakeQuestionsResponse {
  message: string;
  questions: IntakeQuestion[];
}

const FALLBACK: IntakeQuestionsResponse = {
  message: "Resume received. A few quick questions before we start the review.",
  questions: [
    {
      id: "target_market",
      text: "What market is this resume targeting?",
      chips: ["US General", "Big Tech / FAANG", "Canada", "India"],
    },
    {
      id: "review_depth",
      text: "What kind of review do you need?",
      chips: ["Full Review", "Quick Scan"],
    },
    {
      id: "job_description",
      text: "Do you have a specific job description to benchmark against? Paste it below if so — even a rough one helps. If not, just say 'no JD' and I'll use a composite profile for this role.",
      chips: null,
    },
  ],
};

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 10, windowMs: 60000 });
  if (__rl.blocked) return __rl.response;
  const { resumeText } = await req.json();

  if (!resumeText) {
    return NextResponse.json(FALLBACK);
  }

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: RESUME_INTAKE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Resume text:\n<resume>\n${resumeText.slice(0, 4000)}\n</resume>`,
        },
      ],
    });

    let raw = response.content[0].type === "text" ? response.content[0].text : "";
    raw = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

    const parsed = JSON.parse(raw) as IntakeQuestionsResponse;

    // Validate structure
    if (!parsed.message || !Array.isArray(parsed.questions)) {
      return NextResponse.json(FALLBACK);
    }

    // Ensure review_depth and job_description questions are always present
    const hasReviewDepth = parsed.questions.some((q) => q.id === "review_depth");
    const hasJD = parsed.questions.some((q) => q.id === "job_description");

    if (!hasReviewDepth) {
      parsed.questions.push({
        id: "review_depth",
        text: "What kind of review do you need?",
        chips: ["Full Review", "Quick Scan"],
      });
    }
    if (!hasJD) {
      parsed.questions.push({
        id: "job_description",
        text: "Do you have a specific job description to benchmark against? Paste it below if so — even a rough one helps. If not, just say 'no JD'.",
        chips: null,
      });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[intake-questions] Error:", err);
    return NextResponse.json(FALLBACK);
  }
}
