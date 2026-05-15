// JD-tailored resume rewrite for Job Match.
//
// Reuses runRewriteAll (the existing whole-resume Opus rewriter)
// with the JD passed as jobDescription, so the rewrite leans
// keywords + framing toward this exact role. The output is the
// tailored ResumeExtraction; the route persists a snapshot in
// job_match_outputs so reopens are cheap.
//
// Pure wrapper — no new prompt, no new model. Reuses runRewriteAll
// so traceability + validator passes work the same.

import { runRewriteAll, type RewriteAllOutput } from "@/lib/agents/resume/runRewriteAll";
import type { ResumeAnalysis } from "@/lib/agents/schemas/resumeIntelligence";
import type { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import type { JDAnalysis } from "@/lib/agents/jd/runJDAnalyzer";
import type { MatchAnalysis } from "@/lib/agents/jobmatch/runMatchAnalyzer";

export interface TailorJDInput {
  extraction: ResumeExtraction;
  parsedJd: JDAnalysis;
  rawJdText: string;
  // Optional — when a Match Report was already produced, pull its
  // missing / honestGaps in as priorities so the rewriter targets the
  // exact gaps the user got flagged on. Without it, fall back to the
  // JD's must-have skills as the priority list.
  matchAnalysis?: MatchAnalysis | null;
  // Optional — if the user has a prior generic resume analysis, hand
  // it through; otherwise we synthesize a minimal analysis-shaped
  // object from the JD so runRewriteAll has the priorities array it
  // expects.
  priorAnalysis?: ResumeAnalysis | null;
}

// Build a minimal ResumeAnalysis-shaped object the rewriter can consume.
// The only field runRewriteAll actually uses is `rewritePriorities`;
// the rest can be defaulted. This keeps Job Match independent of
// whether the user has a prior resume review.
function synthesizeAnalysisFromJD(
  parsedJd: JDAnalysis,
  matchAnalysis: MatchAnalysis | null | undefined,
  priorAnalysis: ResumeAnalysis | null | undefined,
): ResumeAnalysis {
  // Priority list = match report's missing/gaps first, then JD must-haves,
  // then JD nice-to-haves. Empty-deduped.
  const seen = new Set<string>();
  const priorities: string[] = [];
  const push = (s: string, prefix: "HIGH" | "MEDIUM" | "LOW") => {
    const t = s.trim();
    if (!t || seen.has(t.toLowerCase())) return;
    seen.add(t.toLowerCase());
    priorities.push(`${prefix} — ${t}`);
  };

  for (const m of matchAnalysis?.missing ?? []) push(`Add explicit evidence of ${m}`, "HIGH");
  for (const g of matchAnalysis?.honestGaps ?? []) push(g, "MEDIUM");
  for (const s of parsedJd.mustHaveSkills ?? []) push(`Lead with ${s} where the resume already supports it`, "HIGH");
  for (const s of parsedJd.niceToHaveSkills ?? []) push(`Surface ${s} if applicable`, "LOW");
  for (const r of (parsedJd.responsibilities ?? []).slice(0, 3)) push(`Mirror the language of: "${r.slice(0, 120)}"`, "MEDIUM");

  // Use the prior analysis as a base if present, otherwise build a
  // minimal stub. runRewriteAll only really needs rewritePriorities,
  // but defining the required fields keeps TypeScript happy.
  if (priorAnalysis) {
    return { ...priorAnalysis, rewritePriorities: priorities };
  }

  const emptyCategory = { score: 0, max: 20, status: "REVIEW" as const, deductions: [] };
  return {
    overallAssessment: "JD-tailored rewrite — synthesized analysis.",
    currentPositioning: "",
    likelyTargetRole: parsedJd.role,
    seniorityEstimate: parsedJd.seniority ?? null,
    scores: {
      atsCompatibility: emptyCategory,
      contentImpact: emptyCategory,
      structureFormatting: emptyCategory,
      keywordCoverage: emptyCategory,
      senioritySignal: emptyCategory,
      total: 0,
      projectedPostFix: "",
    },
    strengths: [],
    weaknesses: [],
    weakBullets: [],
    missingSignals: [],
    keywordsPresent: [],
    keywordGaps: parsedJd.mustHaveSkills ?? [],
    atsHeuristics: {
      score: 0,
      formattingRisk: "low",
      scanabilityRisk: "low",
      notes: [],
    },
    rewritePriorities: priorities,
    suggestedNextSteps: [],
  };
}

export async function runJDTailoredResume(input: TailorJDInput): Promise<RewriteAllOutput> {
  const targetRole = input.parsedJd.role || input.priorAnalysis?.likelyTargetRole || "Target role";
  const analysis = synthesizeAnalysisFromJD(input.parsedJd, input.matchAnalysis ?? null, input.priorAnalysis ?? null);
  return runRewriteAll({
    extraction: input.extraction,
    analysis,
    targetRole,
    jobDescription: input.rawJdText.slice(0, 6000),
  });
}
