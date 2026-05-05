import Anthropic from "@anthropic-ai/sdk";
import { REWRITE_ALL_SYSTEM_PROMPT } from "../prompts/rewriteAllPrompt";
import { ResumeExtraction } from "../schemas/resumeExtraction";
import { ResumeAnalysis } from "../schemas/resumeIntelligence";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface RewriteAllInput {
  extraction: ResumeExtraction;
  analysis: ResumeAnalysis;
  targetRole: string;
  jobDescription?: string;
  /** Optional style hint for regeneration ("more senior tone", "more
   *  technical depth", "less corporate") so subsequent runs feel different. */
  styleHint?: string;
}

export interface RewriteAllOutput {
  extraction: ResumeExtraction;
  changedKeys: string[];
}

export async function runRewriteAll(input: RewriteAllInput): Promise<RewriteAllOutput> {
  const userMessage = [
    `TARGET ROLE: ${input.targetRole}`,
    `Preserve this role exactly — do not substitute based on resume content.`,
    "",
    input.styleHint ? `STYLE HINT (this regeneration): ${input.styleHint}` : "",
    "",
    "PRIORITIES (apply ALL high+medium):",
    ...(input.analysis.rewritePriorities ?? []).map((p, i) => `  ${i + 1}. ${p}`),
    "",
    input.jobDescription ? `JOB DESCRIPTION (lean keywords toward this):\n${input.jobDescription.slice(0, 4000)}` : "",
    "",
    "ORIGINAL EXTRACTION:",
    JSON.stringify(input.extraction, null, 2),
  ].filter(Boolean).join("\n");

  // Opus 4.5 — full-resume rewrites are the highest-stakes prompt in the
  // app. Latency cost (~60-90s) is worth quality + conservatism.
  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 8192,
    system: REWRITE_ALL_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  let raw = response.content[0]?.type === "text" ? response.content[0].text : "";
  raw = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  type RewrittenPayload = ResumeExtraction & { changedKeys?: unknown };
  let parsed: RewrittenPayload;
  try {
    parsed = JSON.parse(raw) as RewrittenPayload;
  } catch (err) {
    console.error("[rewrite-all] JSON parse failed:", err);
    console.error("[rewrite-all] raw response start:", raw.slice(0, 600));
    throw new Error("Rewrite returned invalid JSON");
  }

  const { changedKeys: rawChangedKeys, ...rest } = parsed;
  const changedKeys = Array.isArray(rawChangedKeys) ? rawChangedKeys.filter((k): k is string => typeof k === "string") : [];

  // Defensive merge — if the model dropped a top-level field that exists on
  // the original, keep the original's value. Belt-and-suspenders against
  // partial regressions.
  const merged: ResumeExtraction = {
    ...input.extraction,
    ...rest,
  };

  return { extraction: merged, changedKeys };
}
