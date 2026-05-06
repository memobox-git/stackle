// Single source of truth for the 0–100 resume score → tier label mapping.
// Every surface that displays a tier (chat welcome, Report panel hero,
// ScoreReveal loading copy, Rewrite tab) imports `tierLabel` from here so
// the same number never reads as "Solid" in one place and "Needs Work" in
// another. Boundaries chosen to match the Report panel's original
// (stricter) cutoffs — 73 lands in Needs Work, not Solid.
//
// Tiers:
//   ≥ 88   Strong       — recruiter-ready
//   ≥ 75   Solid        — competitive with minor polish
//   ≥ 60   Needs Work   — material gaps to close
//   <  60  Weak         — significant rewrite required

export type ScoreTier = "Strong" | "Solid" | "Needs Work" | "Weak";

export function tierLabel(score: number): ScoreTier {
  if (score >= 88) return "Strong";
  if (score >= 75) return "Solid";
  if (score >= 60) return "Needs Work";
  return "Weak";
}

// Hex colour pair used by the score circle, score-reveal animations and
// the tier badge. Same colours across surfaces keep the visual system
// consistent — green for Strong/Solid, amber for Needs Work, red for Weak.
export function tierColor(score: number): string {
  if (score >= 75) return "#15803d";        // emerald-700
  if (score >= 60) return "#b45309";        // amber-700
  return "#b91c1c";                          // red-700
}

// Single source of truth for "what's the current score?" across every
// surface (chat welcome, Report hero, Edit banner, Rewrite tab). Prefers
// the agent-computed total; falls back to a stable legacy heuristic so
// older analyses without a `scores` object don't suddenly read as 55.
//
// The previous-implementation bug: when `scores.total` was missing each
// surface fell through to its OWN local heuristic, and three surfaces
// gave three different numbers (Welcome 74, Report 75, Edit 55, Rewrite
// 86) on the same analysis. Now they all import this.
//
// Accepts a loose ResumeAnalysis-shaped input. We don't import the type
// here to keep this module dep-light.
export interface ScoreLikeAnalysis {
  scores?: {
    total?: number;
  } | null;
  strengths?: string[];
  weaknesses?: string[];
  keywordGaps?: string[];
  atsHeuristics?: {
    formattingRisk?: "low" | "medium" | "high";
    scanabilityRisk?: "low" | "medium" | "high";
  } | null;
  weakBullets?: unknown[];
}

export function deriveScoreFromAnalysis(a: ScoreLikeAnalysis | null | undefined): number {
  if (!a) return 0;
  if (a.scores && typeof a.scores.total === "number" && a.scores.total > 0) {
    return Math.max(0, Math.min(100, Math.round(a.scores.total)));
  }
  // Legacy fallback. Only fires when the analysis pre-dates the structured
  // scores schema (or scores got stripped during persistence). Same
  // formula every surface used to inline.
  let score = 55;
  score += Math.min((a.strengths?.length ?? 0) * 4, 20);
  score -= Math.min((a.weaknesses?.length ?? 0) * 3, 15);
  score -= Math.min((a.keywordGaps?.length ?? 0) * 1.5, 10);
  if (a.atsHeuristics?.formattingRisk === "low") score += 5;
  if (a.atsHeuristics?.formattingRisk === "high") score -= 5;
  if (a.atsHeuristics?.scanabilityRisk === "low") score += 5;
  if (a.atsHeuristics?.scanabilityRisk === "high") score -= 5;
  score -= Math.min((a.weakBullets?.length ?? 0), 5);
  return Math.max(20, Math.min(100, Math.round(score)));
}
