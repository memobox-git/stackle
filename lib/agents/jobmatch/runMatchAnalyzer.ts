// Match analyzer — Job Match's first-tier "should I apply?" output.
//
// Sonnet 4.5. Input: parsed JD + resume extraction. Output: score
// (0-100), verdict bucket, the specific must-haves the user matches,
// the must-haves they're missing, the keyword gaps, and the
// "honest call" — a 1-2 sentence directive that names the single
// most likely deal-breaker if one exists.
//
// The honest call is what makes this different from any other
// matching tool. Not a vague "73 — Stretch". A real sentence:
// "Apply. But the dbt requirement is the deal-breaker. You ran
// Spark in similar shapes — be ready to talk transferability in
// 30s."

import Anthropic from "@anthropic-ai/sdk";
import type { JDAnalysis } from "@/lib/agents/jd/runJDAnalyzer";
import type { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type MatchVerdict = "strong" | "good" | "stretch" | "skip";

export interface MatchAnalysis {
  score: number;            // 0-100
  verdict: MatchVerdict;
  matches: string[];        // must-haves the user clearly has
  missing: string[];        // must-haves the user clearly lacks
  honestGaps: string[];     // softer gaps worth knowing
  honestCall: string;       // 1-2 sentence directive — what to do
}

const SYSTEM_PROMPT = `You are a senior hiring manager assessing whether a specific resume should apply for a specific JD.

You return ONLY a JSON object matching this exact shape. No prose, no markdown fences.

{
  "score": <0-100 integer>,
  "verdict": "strong" | "good" | "stretch" | "skip",
  "matches": ["<must-have skill the candidate clearly has>", ...],
  "missing": ["<must-have skill the candidate clearly lacks>", ...],
  "honestGaps": ["<softer gap that's worth knowing (years short, adjacent stack, etc)>", ...],
  "honestCall": "<1-2 sentences: tell the candidate exactly what to do. Name the single most likely deal-breaker if one exists. Be direct, not vague.>"
}

SCORE BANDS
- 85-100: strong match. Apply with confidence.
- 65-84: good match. Apply, sharpen the resume for the must-haves they question.
- 45-64: stretch. Apply IF they can credibly bridge the gap; otherwise skip.
- 0-44: skip. Not worth the time.

HONEST CALL — this is the most important field.
- If they should apply: open with "Apply." then state the single biggest hurdle and what to do about it.
- If it's a stretch: "Stretch — apply ONLY if X. Otherwise skip." Name X specifically.
- If they should skip: "Skip. You're missing X, Y, Z which are all must-haves."
- Never write a vague "consider applying" or "could be a good fit". State the action.

DO NOT
- Wrap in fences.
- Reference traits the resume doesn't show.
- Inflate the score because the candidate "could learn" something. Score what they ARE, not what they might become.

Output the JSON object directly.`;

function extractJSON(raw: string): Record<string, unknown> | null {
  let t = raw.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) return null;
  try {
    const parsed = JSON.parse(t.slice(s, e + 1));
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export async function runMatchAnalyzer(opts: {
  parsedJd: JDAnalysis;
  resume: ResumeExtraction;
}): Promise<MatchAnalysis> {
  const { parsedJd, resume } = opts;

  // Compact resume summary — we don't need every bullet, just the
  // signal that drives matching. Top experiences + skills are enough.
  const compactResume = {
    name: resume.name,
    yearsExperience: resume.totalYearsExperience,
    summary: resume.summary,
    skills: (resume.skillGroups ?? []).flatMap((g) => g.skills ?? []).slice(0, 30),
    recentExperience: (resume.experience ?? []).slice(0, 5).map((e) => ({
      title: e.title,
      company: e.company,
      startDate: e.startDate ?? null,
      endDate: e.endDate ?? null,
      bullets: (e.bullets ?? []).slice(0, 4),
    })),
  };

  const userMessage = `JOB DESCRIPTION (parsed):
${JSON.stringify(parsedJd, null, 2)}

CANDIDATE RESUME (compact):
${JSON.stringify(compactResume, null, 2)}

Produce the match analysis JSON.`;

  const res = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2000,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  const raw = res.content[0]?.type === "text" ? res.content[0].text : "";
  const parsed = extractJSON(raw);
  if (!parsed) {
    console.error("[match-analyzer] parse failed. raw head:", raw.slice(0, 400));
    throw new Error("Match analyzer returned invalid JSON");
  }

  const scoreRaw = typeof parsed.score === "number" ? parsed.score : NaN;
  const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 50;
  const verdictRaw = typeof parsed.verdict === "string" ? parsed.verdict.toLowerCase() : "";
  const verdict: MatchVerdict = (["strong", "good", "stretch", "skip"] as const).includes(verdictRaw as MatchVerdict)
    ? (verdictRaw as MatchVerdict)
    : (score >= 85 ? "strong" : score >= 65 ? "good" : score >= 45 ? "stretch" : "skip");

  return {
    score,
    verdict,
    matches: asStringArray(parsed.matches),
    missing: asStringArray(parsed.missing),
    honestGaps: asStringArray(parsed.honestGaps),
    honestCall: typeof parsed.honestCall === "string" ? parsed.honestCall.trim() : "Here's where you stand.",
  };
}
