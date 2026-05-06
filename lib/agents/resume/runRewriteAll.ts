import Anthropic from "@anthropic-ai/sdk";
import { REWRITE_ALL_SYSTEM_PROMPT } from "../prompts/rewriteAllPrompt";
import { ResumeExtraction } from "../schemas/resumeExtraction";
import { ResumeAnalysis } from "../schemas/resumeIntelligence";
import { checkTraceability, describeIssues as describeTraceability } from "../validation/traceabilityCheck";
import { validateRewrite, passesValidation, describeValidationIssues } from "../validation/rewriteValidator";

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
  /** Per-section quality issues found by the validators after generation.
   *  Empty array means a clean rewrite. Non-empty means at least one
   *  field shipped with a known structural / traceability flaw — the
   *  caller can surface to the user or silently log. */
  qualityWarnings?: string[];
}

// Walk the rewritten extraction and validate every section the writers
// touch. Returns ALL issues (errors + warns) flat, with the section key
// already prepended to the message so the regen feedback is targeted.
function collectIssues(ext: ResumeExtraction, original: ResumeExtraction): string[] {
  const out: string[] = [];

  // Summary
  if (ext.summary) {
    const issues = validateRewrite("summary", ext.summary);
    const trace = checkTraceability(ext.summary, original);
    for (const i of issues) {
      if (i.severity === "error") out.push(`summary: ${i.message}`);
    }
    for (const t of trace) {
      out.push(`summary (traceability): ${t.message}`);
    }
  }

  // Experience bullets
  (ext.experience ?? []).forEach((exp, i) => {
    (exp.bullets ?? []).forEach((b, j) => {
      const key = `experience.${i}.bullets.${j}`;
      const issues = validateRewrite(key, b);
      const trace = checkTraceability(b, original);
      for (const issue of issues) {
        if (issue.severity === "error") out.push(`${key}: ${issue.message}`);
      }
      for (const t of trace) {
        out.push(`${key} (traceability): ${t.message}`);
      }
    });
  });

  return out;
}

async function callWriter(userMessage: string): Promise<{ parsed: ResumeExtraction & { changedKeys?: unknown }; raw: string }> {
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
  return { parsed, raw };
}

export async function runRewriteAll(input: RewriteAllInput): Promise<RewriteAllOutput> {
  const baseUserMessage = [
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

  // First pass.
  const first = await callWriter(baseUserMessage);
  const firstIssues = collectIssues(first.parsed as ResumeExtraction, input.extraction);

  // If clean, ship it.
  if (firstIssues.length === 0) {
    return assembleOutput(first.parsed, input.extraction, []);
  }

  // Single regenerate-on-fail pass with targeted feedback. Only the first
  // ~25 issues to keep the prompt size reasonable; the writer will get the
  // pattern from a representative sample.
  const feedback = [
    "Your previous rewrite has structural / traceability problems. Fix EVERY one of these in the next pass:",
    ...firstIssues.slice(0, 25).map((m, i) => `  ${i + 1}. ${m}`),
    "",
    "Re-run the rewrite. Same JSON shape, same priorities, but every issue above must be resolved.",
  ].join("\n");

  let second: { parsed: ResumeExtraction & { changedKeys?: unknown }; raw: string };
  try {
    second = await callWriter(`${baseUserMessage}\n\n──── REGENERATE ────\n${feedback}`);
  } catch {
    // Second pass exploded — ship the first attempt with the warnings.
    return assembleOutput(first.parsed, input.extraction, firstIssues);
  }

  const secondIssues = collectIssues(second.parsed as ResumeExtraction, input.extraction);

  // Pick whichever attempt has fewer issues. Tie → prefer second (regen
  // typically tightens prose even if issue count matches).
  const better = secondIssues.length <= firstIssues.length ? second : first;
  const betterIssues = secondIssues.length <= firstIssues.length ? secondIssues : firstIssues;

  return assembleOutput(better.parsed, input.extraction, betterIssues);
}

function assembleOutput(
  parsed: ResumeExtraction & { changedKeys?: unknown },
  original: ResumeExtraction,
  qualityWarnings: string[],
): RewriteAllOutput {
  const { changedKeys: rawChangedKeys, ...rest } = parsed;
  const changedKeys = Array.isArray(rawChangedKeys) ? rawChangedKeys.filter((k): k is string => typeof k === "string") : [];

  // Defensive merge — if the model dropped a top-level field that exists
  // on the original, keep the original's value. Belt-and-suspenders.
  const merged: ResumeExtraction = {
    ...original,
    ...rest,
  };

  return { extraction: merged, changedKeys, qualityWarnings };
}
