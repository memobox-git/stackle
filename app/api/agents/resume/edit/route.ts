// Bumped from default 10s to 60s — LLM calls routinely take 15-45s.
export const maxDuration = 60;

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import { RESUME_WRITER_SYSTEM_PROMPT } from "@/lib/agents/prompts/resumeWriterPrompt";
import { rateLimit } from "@/lib/rateLimit";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface EditRequest {
  extraction: ResumeExtraction;
  instruction: string;
  resumeContext?: {
    name?: string;
    targetRole?: string | null;
    seniority?: string | null;
  };
  // Previous AI-generated versions the user rejected via Rewrite. The writer
  // must produce something substantively different from these.
  previousAttempts?: string[];
  // Optional angle hint rotated per rewrite attempt (e.g. "go tighter",
  // "lead with quantified impact", "use a more senior verb").
  styleHint?: string;
  // When the user hits Rewrite on an already-proposed fix, we lock the section
  // so the writer can't drift to a different area of the resume on retry.
  lockedSectionKey?: string;
  // Section keys the writer MUST NOT touch (Fix All sends all bullets that
  // pass the "already strong" heuristic, plus any user-locked bullets).
  lockedBullets?: string[];
  // When true, `instruction` is the user's literal words typed into the
  // Sparkles input. The writer must follow it EXACTLY — don't interpret it
  // as an invitation to rewrite. "Just remove the word X" means remove only
  // that word and return the rest byte-identical.
  userVerbatim?: boolean;
}

function buildExtractionSummary(extraction: ResumeExtraction): string {
  const lines: string[] = [];
  lines.push(`Name: ${extraction.name}`);
  if (extraction.summary) lines.push(`Summary: ${extraction.summary}`);

  if (extraction.experience?.length) {
    lines.push("Experience:");
    extraction.experience.forEach((exp, i) => {
      lines.push(`  [${i}] ${exp.title} at ${exp.company} (${exp.startDate} – ${exp.endDate ?? "present"})`);
      exp.bullets.forEach((b, j) => {
        lines.push(`    bullet[${j}]: ${b}`);
      });
    });
  }

  if (extraction.skillGroups?.length) {
    lines.push("Skills:");
    extraction.skillGroups.forEach((g, i) => {
      lines.push(`  [${i}] ${g.category}: ${g.skills.join(", ")}`);
    });
  }

  if (extraction.education?.length) {
    lines.push("Education:");
    extraction.education.forEach((e, i) => {
      lines.push(`  [${i}] ${e.degree}${e.field ? `, ${e.field}` : ""} at ${e.institution}`);
    });
  }

  if (extraction.projects?.length) {
    lines.push("Projects:");
    extraction.projects.forEach((p, i) => {
      lines.push(`  [${i}] ${p.name}: ${p.description ?? ""}`);
    });
  }

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 30, windowMs: 60000 });
  if (__rl.blocked) return __rl.response;
  try {
    const body: EditRequest = await req.json();

    if (!body.extraction || !body.instruction) {
      return new Response(JSON.stringify({ error: "extraction and instruction are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const previousBlock = body.previousAttempts && body.previousAttempts.length > 0
      ? `\n\nPrevious AI versions the user REJECTED. Produce something substantively different — different angle, different emphasis, different structure. Do not paraphrase these:\n${body.previousAttempts.map((p, i) => `  [${i + 1}] ${p}`).join("\n")}`
      : "";

    const styleBlock = body.styleHint
      ? `\n\nAngle for this attempt: ${body.styleHint}`
      : "";

    const lockBlock = body.lockedSectionKey
      ? `\n\nLOCKED SECTION: You MUST use sectionKey="${body.lockedSectionKey}". Do not pick a different section. Rewrite only that exact section with content appropriate to its key format.`
      : "";

    const lockedBulletsBlock = body.lockedBullets && body.lockedBullets.length > 0
      ? `\n\nDO NOT return any of these sectionKeys — these bullets are already strong and the user asked us to leave them alone: ${body.lockedBullets.map(k => `"${k}"`).join(", ")}. Pick a different bullet. If every bullet in a role is locked, route the fix to the summary or skills instead of touching experience.`
      : "";

    // When the instruction came from the Sparkles input, the user typed it
    // themselves — treat it as a hard directive, not a suggestion. Override
    // the writer's default "rewrite for impact" bias with a literal-follow
    // clause at the top of the user message so the model sees it first.
    const verbatimGuard = body.userVerbatim
      ? `⚠️ USER'S EXACT INSTRUCTION — FOLLOW IT LITERALLY.
The user typed this themselves into a text box. Do NOT reinterpret it as a generic "improve this bullet" request.
- If they say "just remove X", remove ONLY X and keep every other word byte-identical.
- If they say "add a category", add a new category with a sensible name; do NOT rewrite existing categories.
- If they say "shorter", trim; do NOT change meaning, metrics, or structure beyond length.
- Do NOT add improvements they didn't ask for. Do NOT substitute "better" words.
- The output's newContent must be the MINIMUM edit that satisfies their words.

User said: "${body.instruction}"

`
      : "";

    const userMessage = `${verbatimGuard}Candidate: ${body.resumeContext?.name ?? body.extraction.name}
Target role: ${body.resumeContext?.targetRole ?? "not specified"}
Seniority target: ${body.resumeContext?.seniority ?? "not specified"}

Resume sections:
${buildExtractionSummary(body.extraction)}

Improvement instruction:
${body.instruction}${previousBlock}${styleBlock}${lockBlock}${lockedBulletsBlock}

Identify the correct sectionKey and rewrite only that section. Respond with JSON only.`;

    const message = await client.messages.create({
      // Sonnet for higher-quality rewrites — Haiku was fast but produced
      // safe, generic bullets. This is the user-visible writer, quality > latency.
      model: "claude-sonnet-4-5",
      max_tokens: 1200,
      system: RESUME_WRITER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text.trim() : "";

    // Strip markdown fences if present
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed: { sectionKey: string; newContent: string };
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return new Response(JSON.stringify({ error: "AI returned invalid JSON", raw: rawText }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!parsed.sectionKey || parsed.newContent === undefined) {
      return new Response(JSON.stringify({ error: "Missing sectionKey or newContent", raw: rawText }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
