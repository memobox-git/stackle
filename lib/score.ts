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
