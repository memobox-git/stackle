import Anthropic from "@anthropic-ai/sdk";
import { INTERVIEW_PREP_SYSTEM_PROMPT } from "../prompts/interviewPrepPrompt";
import { InterviewPrepPlan, FALLBACK_INTERVIEW_PREP } from "../schemas/interviewPrep";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function runInterviewPrep({
  role,
  level,
  interviewType,
  resumeText,
}: {
  role: string;
  level: string;
  interviewType: string;
  resumeText?: string | null;
}): Promise<InterviewPrepPlan> {
  const userContext = [
    `Generate an interview preparation plan for:`,
    `- Role: ${role}`,
    `- Level: ${level}`,
    `- Interview type: ${interviewType}`,
    resumeText
      ? `\nCandidate resume (use this to personalize STAR examples):\n<resume>\n${resumeText.slice(0, 3000)}\n</resume>`
      : "",
  ].join("\n");

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 8192,
      system: INTERVIEW_PREP_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContext }],
    });

    let rawText = response.content[0].type === "text" ? response.content[0].text : "";
    rawText = rawText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
    return JSON.parse(rawText) as InterviewPrepPlan;
  } catch (err) {
    console.error("[interview-prep] Error:", err);
    return FALLBACK_INTERVIEW_PREP;
  }
}
