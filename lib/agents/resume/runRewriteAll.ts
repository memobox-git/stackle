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
  /** Fix #6 — priorities the user already accepted in a prior pass.
   *  The writer prompt tells the model NOT to re-propose these so
   *  successive runs don't loop on the same items. Optional; empty
   *  array means "fresh rewrite, apply everything in priorities". */
  appliedPriorities?: string[];
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
  // Fix #6 — partition priorities into pending vs already-applied so the
  // writer doesn't re-propose what the user already accepted.
  const allPriorities = input.analysis.rewritePriorities ?? [];
  const applied = new Set(input.appliedPriorities ?? []);
  const pending = allPriorities.filter((p) => !applied.has(p));
  const alreadyDone = allPriorities.filter((p) => applied.has(p));

  const baseUserMessage = [
    `TARGET ROLE: ${input.targetRole}`,
    `Preserve this role exactly — do not substitute based on resume content.`,
    "",
    input.styleHint ? `STYLE HINT (this regeneration): ${input.styleHint}` : "",
    "",
    "PRIORITIES (apply ALL high+medium):",
    ...pending.map((p, i) => `  ${i + 1}. ${p}`),
    "",
    alreadyDone.length > 0
      ? [
          "ALREADY APPLIED (do NOT re-suggest, do NOT undo, treat as resolved):",
          ...alreadyDone.map((p, i) => `  ${i + 1}. ${p}`),
        ].join("\n")
      : "",
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

// Reject corrupted-looking values the model occasionally produces:
//   - name "there" (bleeds from chat context "Hey there")
//   - location "City, State" (literal placeholder)
//   - empty arrays where original had content
const PLACEHOLDER_NAME_RX = /^(there|candidate|user|name|john\s+doe|jane\s+doe)$/i;
const PLACEHOLDER_LOCATION_RX = /^(city,?\s*state|location|address|n\/a)$/i;

function pickStringField(rewritten: unknown, original: string | null, opts?: { rejectPattern?: RegExp }): string | null {
  // If the model returned a string and it doesn't match a placeholder pattern, take it.
  // Otherwise fall back to original.
  if (typeof rewritten === "string" && rewritten.trim().length > 0) {
    const trimmed = rewritten.trim();
    if (opts?.rejectPattern && opts.rejectPattern.test(trimmed)) {
      return original;
    }
    return trimmed;
  }
  return original;
}

function pickArrayField<T>(rewritten: unknown, original: T[] | undefined): T[] {
  // If the model returned a non-empty array, take it. Otherwise restore
  // the original's array so we never silently drop entire sections.
  if (Array.isArray(rewritten) && rewritten.length > 0) return rewritten as T[];
  return Array.isArray(original) ? original : [];
}

// Fix #7 — diff guard. If the rewriter returned content that's
// functionally identical to the input (summary unchanged AND no
// experience bullet was touched), flag it as a quality warning so
// the client can surface "Rewriter returned content identical to
// input" instead of silently shipping an unchanged resume.
function isUnchanged(merged: ResumeExtraction, original: ResumeExtraction): boolean {
  const sumSame = (merged.summary ?? "").trim() === (original.summary ?? "").trim();
  if (!sumSame) return false;
  const mergedBullets = (merged.experience ?? []).flatMap((e) => e.bullets ?? []);
  const originalBullets = (original.experience ?? []).flatMap((e) => e.bullets ?? []);
  if (mergedBullets.length !== originalBullets.length) return false;
  for (let i = 0; i < mergedBullets.length; i++) {
    if ((mergedBullets[i] ?? "").trim() !== (originalBullets[i] ?? "").trim()) return false;
  }
  return true;
}

function assembleOutput(
  parsed: ResumeExtraction & { changedKeys?: unknown },
  original: ResumeExtraction,
  qualityWarnings: string[],
): RewriteAllOutput {
  const { changedKeys: rawChangedKeys, ...rest } = parsed;
  const changedKeys = Array.isArray(rawChangedKeys) ? rawChangedKeys.filter((k): k is string => typeof k === "string") : [];

  // Field-by-field defensive merge. The previous {...original, ...rest}
  // spread let corrupted values through (name="there", location="City, State"),
  // and let empty arrays from the model wipe out the original's
  // experience/education/projects/etc. Now every field is checked
  // individually and only replaces the original when it's clearly better.
  const merged: ResumeExtraction = {
    name:                  pickStringField(rest.name, original.name, { rejectPattern: PLACEHOLDER_NAME_RX }) ?? original.name,
    email:                 pickStringField(rest.email, original.email),
    phone:                 pickStringField(rest.phone, original.phone),
    linkedin:              pickStringField(rest.linkedin, original.linkedin),
    location:              pickStringField(rest.location, original.location, { rejectPattern: PLACEHOLDER_LOCATION_RX }),
    summary:               pickStringField(rest.summary, original.summary),
    totalYearsExperience:  typeof rest.totalYearsExperience === "number" ? rest.totalYearsExperience : (original.totalYearsExperience ?? null),
    experience:            pickArrayField(rest.experience, original.experience),
    education:             pickArrayField(rest.education, original.education),
    skillGroups:           pickArrayField(rest.skillGroups, original.skillGroups),
    projects:              pickArrayField(rest.projects, original.projects),
    certifications:        pickArrayField(rest.certifications, original.certifications),
    awards:                pickArrayField(rest.awards, original.awards),
    volunteer:             pickArrayField(rest.volunteer, original.volunteer),
    publications:          pickArrayField(rest.publications, original.publications),
    links:                 pickArrayField(rest.links, original.links),
    languages:             pickArrayField(rest.languages, original.languages),
  };

  // Fix #7 — surface unchanged-output as a quality warning. Client can
  // detect this exact string and surface a user-visible error instead
  // of silently rendering the same resume back.
  const warnings = [...qualityWarnings];
  if (isUnchanged(merged, original)) {
    warnings.unshift("Rewriter returned content identical to input — try a different style or regenerate.");
  }

  return { extraction: merged, changedKeys, qualityWarnings: warnings };
}
