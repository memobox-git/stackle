// Vercel Pro allows up to 300s — gives Sonnet room to finish full analyses without cutoff.
export const maxDuration = 300;

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import { RESUME_WRITER_SYSTEM_PROMPT } from "@/lib/agents/prompts/resumeWriterPrompt";
import { rateLimit } from "@/lib/rateLimit";
import { checkTraceability, describeIssues as describeTraceability } from "@/lib/agents/validation/traceabilityCheck";
import { validateRewrite, passesValidation, describeValidationIssues } from "@/lib/agents/validation/rewriteValidator";

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

    // Generate-with-validate loop. The writer can hallucinate metrics or
    // technologies the candidate doesn't have, or violate structural rules
    // (banned phrases, oversized bullets, multi-sentence). We run two
    // checks on the response — traceabilityCheck (catches invented facts)
    // and validateRewrite (catches stylistic violations). If either fails
    // with errors, we feed the issues back to the writer and try ONCE
    // more. After that we accept the cleaner of the two attempts.

    type WriterAttempt = {
      parsed: { sectionKey: string; newContent: string };
      validationIssues: ReturnType<typeof validateRewrite>;
      traceabilityIssues: ReturnType<typeof checkTraceability>;
      raw: string;
    };

    const runWriter = async (extraMessage: string): Promise<WriterAttempt | { error: string; raw: string }> => {
      const message = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1200,
        system: RESUME_WRITER_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage + extraMessage }],
      });
      const rawText = message.content[0].type === "text" ? message.content[0].text.trim() : "";
      const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      let parsed: { sectionKey: string; newContent: string };
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        return { error: "AI returned invalid JSON", raw: rawText };
      }
      if (!parsed.sectionKey || parsed.newContent === undefined) {
        return { error: "Missing sectionKey or newContent", raw: rawText };
      }
      // Skip both checks for the not-applicable signal — it's a meta
      // response, not a rewrite.
      if (parsed.sectionKey === "__not_applicable__") {
        return { parsed, validationIssues: [], traceabilityIssues: [], raw: rawText };
      }
      const validationIssues = validateRewrite(parsed.sectionKey, parsed.newContent);
      const traceabilityIssues = checkTraceability(parsed.newContent, body.extraction);
      return { parsed, validationIssues, traceabilityIssues, raw: rawText };
    };

    // First pass.
    const first = await runWriter("");
    if ("error" in first) {
      return new Response(JSON.stringify({ error: first.error, raw: first.raw }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const firstHasErrors = !passesValidation(first.validationIssues) || first.traceabilityIssues.length > 0;

    // If the first pass is clean, accept it.
    if (!firstHasErrors) {
      return new Response(JSON.stringify(first.parsed), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Otherwise feed the issues back for a single regenerate attempt. We
    // only retry once — if the second pass still fails, we ship the cleaner
    // of the two so the user gets SOMETHING rather than an error.
    const feedback = [
      describeValidationIssues(first.validationIssues),
      describeTraceability(first.traceabilityIssues),
    ].filter(Boolean).join("\n\n");
    const second = await runWriter(`\n\n──── REGENERATE ────\n${feedback}`);

    if ("error" in second) {
      // Second pass failed to produce JSON — fall back to first.
      return new Response(JSON.stringify(first.parsed), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Pick the cleaner of the two attempts. Prefer no traceability issues
    // (factual integrity is more important than stylistic polish).
    const secondHasErrors = !passesValidation(second.validationIssues) || second.traceabilityIssues.length > 0;
    const better =
      !secondHasErrors ? second :
      second.traceabilityIssues.length < first.traceabilityIssues.length ? second :
      second.validationIssues.length < first.validationIssues.length ? second :
      first;

    return new Response(JSON.stringify(better.parsed), {
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
